'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdminUi } from '@/components/admin-ui-provider';
import {
  Inventory,
  InventoryMovementType,
  ProductForInventoryCatalog,
  normalizeInventoryList,
  normalizeProductsForInventoryCatalog,
  QUICK_QTY_PRESETS,
  getAvailabilityClass,
  computeAvailableStock,
  normalizeInventoryAttribute,
} from '@/lib/admin-inventory-types';
import { AdminSelect } from '@/components/admin-select';

type CatalogVariant = NonNullable<ProductForInventoryCatalog['variants']>[number];

interface AxisValue {
  id: number;
  label: string;
}

interface MatrixCell {
  variantId: number;
  sku: string;
  inventory: Inventory | null;
}

interface PendingMovement {
  variantId: number;
  inventoryId: number | null;
  initialStock: number;
  delta: number;
}

const QUICK_MOVEMENT_DEBOUNCE_MS = 500;

function attrLabel(value?: string | null): string {
  return normalizeInventoryAttribute(value) || 'Única';
}

export function AdminInventoryProductPage() {
  const params = useParams<{ productId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showAlert, confirm } = useAdminUi();

  const productId = Number(params?.productId || 0);
  const storeIdParam = Number(searchParams.get('storeId') || 0);

  const [allItems, setAllItems] = useState<Inventory[]>([]);
  const [product, setProduct] = useState<ProductForInventoryCatalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [moveQty, setMoveQty] = useState(1);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [adjustKey, setAdjustKey] = useState<string | null>(null);
  const [adjustValue, setAdjustValue] = useState(0);
  const [pendingDeltas, setPendingDeltas] = useState<Record<string, number>>({});
  const [groupBy, setGroupBy] = useState<'color' | 'size'>('color');
  const [collapsedKeys, setCollapsedKeys] = useState<Set<number>>(new Set());
  const pendingMovementsRef = useRef<Map<string, PendingMovement>>(new Map());
  const movementTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const inFlightMovementKeysRef = useRef<Set<string>>(new Set());

  function toggleGroup(id: number) {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function changeGroupBy(next: 'color' | 'size') {
    setGroupBy(next);
    setCollapsedKeys(new Set());
    setAdjustKey(null);
  }

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [invResponse, prodResponse] = await Promise.all([
        fetch('/api/admin/inventory?skip=1&take=300&includeZero=true', { method: 'GET', cache: 'no-store' }),
        fetch('/api/admin/products?skip=1&take=500', { method: 'GET', cache: 'no-store' }),
      ]);

      const invPayload = await invResponse.json().catch(() => null);
      if (invResponse.ok) {
        setAllItems(normalizeInventoryList(invPayload).filter((item) => item.variant.product.id === productId));
      } else {
        showAlert(String((invPayload as { message?: unknown } | null)?.message || 'Error al cargar inventario.'), 'error');
        setAllItems([]);
      }

      const prodPayload = await prodResponse.json().catch(() => null);
      if (prodResponse.ok) {
        setProduct(normalizeProductsForInventoryCatalog(prodPayload).find((item) => item.id === productId) || null);
      }
    } catch {
      showAlert('Error al cargar inventario.', 'error');
      setAllItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [productId, showAlert]);

  useEffect(() => {
    if (productId > 0) {
      loadData();
    }
  }, [productId, loadData]);

  useEffect(() => () => {
    for (const timer of movementTimersRef.current.values()) clearTimeout(timer);
    movementTimersRef.current.clear();
    pendingMovementsRef.current.clear();
    inFlightMovementKeysRef.current.clear();
  }, []);

  const productName = product?.name || allItems[0]?.variant.product.name || 'Producto';

  // Todas las variantes activas del producto (incluye las que aun no tienen stock).
  const productVariants = useMemo<CatalogVariant[]>(
    () => (product?.variants || []).filter((variant) => variant.isActive !== false),
    [product],
  );

  // Tiendas donde el producto tiene inventario.
  const storeOptions = useMemo<AxisValue[]>(() => {
    const map = new Map<number, string>();
    allItems.forEach((item) => map.set(item.store.id, item.store.name));
    return Array.from(map.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [allItems]);

  // Tienda activa: la del query, o la primera disponible.
  const activeStoreId = useMemo(() => {
    if (storeIdParam > 0 && storeOptions.some((store) => store.id === storeIdParam)) {
      return storeIdParam;
    }
    return storeOptions[0]?.id || 0;
  }, [storeIdParam, storeOptions]);

  const items = useMemo(
    () => allItems.filter((item) => item.store.id === activeStoreId),
    [allItems, activeStoreId],
  );

  // Ejes de la matriz derivados de TODAS las variantes del producto; cada celda
  // referencia su inventario en la tienda activa (null = variante aun sin stock).
  const { colors, sizes, cells } = useMemo(() => {
    const colorMap = new Map<number, AxisValue>();
    const sizeMap = new Map<number, AxisValue>();
    const cellMap = new Map<string, MatrixCell>();
    const invByVariant = new Map<number, Inventory>();
    items.forEach((item) => invByVariant.set(item.variant.id, item));

    productVariants.forEach((variant) => {
      const colorId = Number(variant.color?.id || 0);
      const sizeId = Number(variant.size?.id || 0);
      if (!colorMap.has(colorId)) {
        colorMap.set(colorId, { id: colorId, label: attrLabel(variant.color?.name) });
      }
      if (!sizeMap.has(sizeId)) {
        sizeMap.set(sizeId, { id: sizeId, label: attrLabel(variant.size?.name) });
      }
      cellMap.set(`${colorId}-${sizeId}`, {
        variantId: variant.id,
        sku: variant.sku,
        inventory: invByVariant.get(variant.id) || null,
      });
    });

    const sortAxis = (a: AxisValue, b: AxisValue) => a.label.localeCompare(b.label, undefined, { numeric: true });
    return {
      colors: Array.from(colorMap.values()).sort(sortAxis),
      sizes: Array.from(sizeMap.values()).sort(sortAxis),
      cells: cellMap,
    };
  }, [productVariants, items]);

  const totalAvailable = useMemo(
    () => items.reduce((sum, item) => sum + computeAvailableStock(item), 0),
    [items],
  );

  const pendingVariants = useMemo(
    () => productVariants.filter((variant) => !items.some((item) => item.variant.id === variant.id)).length,
    [productVariants, items],
  );

  function changeStore(nextStoreId: number) {
    setAdjustKey(null);
    router.replace(`/admin/inventory/product/${productId}?storeId=${nextStoreId}`);
  }

  // Patch local del stock tras un movimiento (evita recargar los ~300 items).
  function applyStockDelta(inventoryId: number, delta: number) {
    setAllItems((prev) => prev.map((row) => {
      if (row.id !== inventoryId) {
        return row;
      }
      const stock = Math.max(0, Number(row.stock || 0) + delta);
      const reserved = Number(row.reservedStock || 0);
      return { ...row, stock, availableStock: stock - reserved };
    }));
  }

  async function postMovement(variantId: number, type: InventoryMovementType, quantity: number, note: string): Promise<boolean> {
    const response = await fetch('/api/admin/inventory/movements', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storeId: activeStoreId, variantId, quantity, type, note }),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;
    if (!response || !response.ok) {
      showAlert(String((payload as { message?: unknown } | null)?.message || 'Error al registrar movimiento.'), 'error');
      return false;
    }
    return true;
  }

  function clearQueuedMovement(cellKey: string) {
    const timer = movementTimersRef.current.get(cellKey);
    if (timer) clearTimeout(timer);
    movementTimersRef.current.delete(cellKey);
    pendingMovementsRef.current.delete(cellKey);
    setPendingDeltas((current) => {
      if (!(cellKey in current)) return current;
      const next = { ...current };
      delete next[cellKey];
      return next;
    });
  }

  async function flushQueuedMovement(cellKey: string) {
    const pending = pendingMovementsRef.current.get(cellKey);
    movementTimersRef.current.delete(cellKey);
    if (!pending || pending.delta === 0 || inFlightMovementKeysRef.current.has(cellKey)) return;

    inFlightMovementKeysRef.current.add(cellKey);
    setBusyKey(cellKey);
    try {
      if (pending.delta < 0 && pending.initialStock + pending.delta < 0) {
        const proceed = await confirm({
          title: 'Stock insuficiente',
          message: `La salida acumulada de ${Math.abs(pending.delta)} deja el stock en ${pending.initialStock + pending.delta} (hay ${pending.initialStock}). ¿Registrar de todas formas?`,
          acceptText: 'Registrar',
        });
        if (!proceed) return;
      }

      const type: 'IN' | 'OUT' = pending.delta > 0 ? 'IN' : 'OUT';
      const quantity = Math.abs(pending.delta);
      const ok = await postMovement(
        pending.variantId,
        type,
        quantity,
        type === 'IN' ? 'Ingreso rapido acumulado' : 'Salida rapida acumulada',
      );
      if (!ok) return;

      if (pending.inventoryId) {
        applyStockDelta(pending.inventoryId, pending.delta);
      } else {
        // El primer lote crea el inventario y necesitamos su identificador.
        await loadData();
      }
      showAlert(`${type === 'IN' ? 'Ingreso' : 'Salida'} de ${quantity} registrado.`, 'success');
    } finally {
      clearQueuedMovement(cellKey);
      inFlightMovementKeysRef.current.delete(cellKey);
      setBusyKey((current) => current === cellKey ? null : current);
    }
  }

  function queueMovement(cellKey: string, cell: MatrixCell, type: 'IN' | 'OUT') {
    if (inFlightMovementKeysRef.current.has(cellKey)) return;
    if (type === 'OUT' && !cell.inventory) return;

    const step = Math.max(1, moveQty) * (type === 'IN' ? 1 : -1);
    const current = pendingMovementsRef.current.get(cellKey);
    const next: PendingMovement = current
      ? { ...current, delta: current.delta + step }
      : {
          variantId: cell.variantId,
          inventoryId: cell.inventory?.id ?? null,
          initialStock: Number(cell.inventory?.stock || 0),
          delta: step,
        };

    const previousTimer = movementTimersRef.current.get(cellKey);
    if (previousTimer) clearTimeout(previousTimer);
    if (next.delta === 0) {
      clearQueuedMovement(cellKey);
      return;
    }

    pendingMovementsRef.current.set(cellKey, next);
    setPendingDeltas((values) => ({ ...values, [cellKey]: next.delta }));
    const timer = setTimeout(() => {
      void flushQueuedMovement(cellKey);
    }, QUICK_MOVEMENT_DEBOUNCE_MS);
    movementTimersRef.current.set(cellKey, timer);
  }

  function openAdjust(cellKey: string, cell: MatrixCell) {
    if (!cell.inventory) {
      return;
    }
    setAdjustKey(cellKey);
    setAdjustValue(Number(cell.inventory.stock || 0));
  }

  async function confirmAdjust(cellKey: string, cell: MatrixCell) {
    if (busyKey || !cell.inventory) {
      return;
    }
    const delta = adjustValue - Number(cell.inventory.stock || 0);
    if (delta === 0) {
      setAdjustKey(null);
      return;
    }
    setBusyKey(cellKey);
    const ok = await postMovement(cell.variantId, 'ADJUSTMENT', delta, `Ajuste por conteo real a ${adjustValue}`);
    if (ok) {
      applyStockDelta(cell.inventory.id, delta);
      showAlert(`Ajuste registrado (stock ${adjustValue}).`, 'success');
      setAdjustKey(null);
    }
    setBusyKey(null);
  }

  if (isLoading) {
    return <article className="admin-card"><p>Cargando inventario del producto...</p></article>;
  }

  if (productVariants.length === 0) {
    return (
      <section className="inventory-matrix-section">
        <div className="inventory-matrix-head">
          <Link href="/admin/inventory" className="admin-ghost-btn">← Volver</Link>
          <h2>{productName}</h2>
        </div>
        <article className="admin-card"><p>Este producto no tiene variantes activas.</p></article>
      </section>
    );
  }

  return (
    <section className="inventory-matrix-section">
      <div className="inventory-matrix-head">
        <Link href="/admin/inventory" className="admin-ghost-btn">← Volver</Link>
        <div className="inventory-matrix-title">
          <h2>{productName}</h2>
          <p className="admin-muted-text">
            {productVariants.length} variantes · disponible total <strong>{totalAvailable}</strong>
            {pendingVariants > 0 ? <> · <span className="inventory-matrix-pending">{pendingVariants} sin stock aún</span></> : null}
          </p>
        </div>
        {storeOptions.length > 1 ? (
          <label className="inventory-matrix-store">
            <span>Tienda</span>
            <AdminSelect
              value={String(activeStoreId)}
              ariaLabel="Tienda"
              onChange={(value) => changeStore(Number(value))}
              options={storeOptions.map((store) => ({ value: String(store.id), label: store.label }))}
            />
          </label>
        ) : (
          <span className="inventory-matrix-store-static">{storeOptions[0]?.label}</span>
        )}
      </div>

      <article className="admin-card inventory-matrix-qty-card">
        <span className="inventory-matrix-qty-label">Cantidad por movimiento</span>
        <div className="inventory-qty-stepper-next">
          <button type="button" aria-label="Menos" disabled={moveQty <= 1} onClick={() => setMoveQty((qty) => Math.max(1, qty - 1))}>−</button>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={moveQty}
            aria-label="Cantidad"
            onChange={(event) => setMoveQty(Math.max(1, Number(event.target.value) || 1))}
          />
          <button type="button" aria-label="Mas" onClick={() => setMoveQty((qty) => qty + 1)}>+</button>
        </div>
        <div className="inventory-qty-presets-next">
          {QUICK_QTY_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset}
              className={`inventory-qty-preset-next${moveQty === preset ? ' is-active' : ''}`}
              onClick={() => setMoveQty(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      </article>

      <div className="inv-mtx-groupby" role="group" aria-label="Agrupar por">
        <span className="inv-mtx-groupby-label">Agrupar por</span>
        <button
          type="button"
          className={`inv-mtx-groupby-btn${groupBy === 'color' ? ' is-active' : ''}`}
          aria-pressed={groupBy === 'color'}
          onClick={() => changeGroupBy('color')}
        >
          Color
        </button>
        <button
          type="button"
          className={`inv-mtx-groupby-btn${groupBy === 'size' ? ' is-active' : ''}`}
          aria-pressed={groupBy === 'size'}
          onClick={() => changeGroupBy('size')}
        >
          Talla
        </button>
      </div>

      <div className="inv-mtx-colors">
        {(groupBy === 'color' ? colors : sizes).map((primary) => {
          // cellKey siempre es `${colorId}-${sizeId}`, sin importar el eje agrupador.
          const secondaryAxis = groupBy === 'color' ? sizes : colors;
          const cellKeyFor = (secondaryId: number) => (
            groupBy === 'color' ? `${primary.id}-${secondaryId}` : `${secondaryId}-${primary.id}`
          );
          const rows = secondaryAxis
            .map((secondary) => ({ secondary, cellKey: cellKeyFor(secondary.id), cell: cells.get(cellKeyFor(secondary.id)) }))
            .filter((row): row is { secondary: AxisValue; cellKey: string; cell: MatrixCell } => Boolean(row.cell));
          const groupAvailable = rows.reduce((sum, row) => sum + (row.cell.inventory ? computeAvailableStock(row.cell.inventory) : 0), 0);
          const groupPending = rows.filter((row) => !row.cell.inventory).length;
          const collapsed = collapsedKeys.has(primary.id);

          return (
            <article className="admin-card inv-mtx-color-card" key={primary.id}>
              <button
                type="button"
                className="inv-mtx-color-head"
                aria-expanded={!collapsed}
                onClick={() => toggleGroup(primary.id)}
              >
                <span className="inv-mtx-chevron" aria-hidden>{collapsed ? '▸' : '▾'}</span>
                <span className="inv-mtx-color-name">{primary.label}</span>
                <span className="inv-mtx-color-meta">
                  {groupAvailable} disp.
                  {groupPending > 0 ? <span className="inventory-matrix-pending"> · {groupPending} sin stock</span> : null}
                </span>
              </button>

              {collapsed ? null : (
                <div className="inv-mtx-sizes">
                  {rows.map(({ secondary, cellKey, cell }) => {
                    const busy = busyKey === cellKey;
                    const editing = adjustKey === cellKey;
                    const inventory = cell.inventory;
                    const pendingDelta = pendingDeltas[cellKey] || 0;
                    const available = (inventory ? computeAvailableStock(inventory) : 0) + pendingDelta;

                    return (
                      <div className={`inv-mtx-size-row${inventory ? '' : ' is-new'}`} key={cellKey}>
                        <span className="inv-mtx-size-label">{secondary.label}</span>
                        <span className={`inventory-matrix-stock ${inventory ? getAvailabilityClass(available) : 'is-out'}`}>
                          {available}
                        </span>

                        {!inventory ? (
                          <div className="inv-mtx-size-actions">
                            <span className="inventory-matrix-new-tag">sin stock</span>
                            <button
                              type="button"
                              className="inventory-matrix-btn income inventory-matrix-btn-wide"
                              disabled={busy}
                              title="Primer ingreso"
                              onClick={() => queueMovement(cellKey, cell, 'IN')}
                            >
                              Ingresar +{moveQty}
                            </button>
                          </div>
                        ) : editing ? (
                          <div className="inventory-matrix-adjust">
                            <input
                              type="number"
                              min={0}
                              value={adjustValue}
                              aria-label="Conteo real"
                              onChange={(event) => setAdjustValue(Math.max(0, Number(event.target.value) || 0))}
                            />
                            <div className="inventory-matrix-adjust-btns">
                              <button type="button" className="is-ok" disabled={busy} onClick={() => confirmAdjust(cellKey, cell)}>✓</button>
                              <button type="button" disabled={busy} onClick={() => setAdjustKey(null)}>✕</button>
                            </div>
                          </div>
                        ) : (
                          <div className="inv-mtx-size-actions">
                            <button type="button" className="inventory-matrix-btn income" disabled={busy} title="Ingreso" onClick={() => queueMovement(cellKey, cell, 'IN')}>+{moveQty}</button>
                            <button type="button" className="inventory-matrix-btn outcome" disabled={busy} title="Salida" onClick={() => queueMovement(cellKey, cell, 'OUT')}>−{moveQty}</button>
                            <button type="button" className="inventory-matrix-btn adjust" disabled={busy || pendingDelta !== 0} title="Ajustar conteo" onClick={() => openAdjust(cellKey, cell)}>Aj</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
