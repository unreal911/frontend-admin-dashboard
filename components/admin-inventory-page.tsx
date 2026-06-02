'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAdminUi } from '@/components/admin-ui-provider';
import {
  Inventory,
  InventoryMovementType,
  InventoryReservation,
  InventoryStore,
  ProductForInventoryCatalog,
  normalizeInventoryList,
  normalizeProductsForInventoryCatalog,
  normalizeReservations,
} from '@/lib/admin-inventory-types';

interface InventoryVariantOption {
  variantId: number;
  sku: string;
  productName: string;
  colorName: string;
  sizeName: string;
  label: string;
}

type InventoryStockScope = 'ALL' | 'OUT' | 'CRITICAL' | 'LOW' | 'NORMAL';

function toPositiveInt(value: string): number | null {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) {
    return null;
  }
  return numeric;
}

function computeAvailableStock(item: Inventory): number {
  const availableStock = Number(item.availableStock);
  if (Number.isFinite(availableStock)) {
    return availableStock;
  }
  return Number(item.stock || 0) - Number(item.reservedStock || 0);
}

export function AdminInventoryPage() {
  const router = useRouter();
  const { confirm, showAlert } = useAdminUi();

  const [inventoryData, setInventoryData] = useState<Inventory[]>([]);
  const [reservationsData, setReservationsData] = useState<InventoryReservation[]>([]);
  const [productCatalog, setProductCatalog] = useState<ProductForInventoryCatalog[]>([]);
  const [storeOptions, setStoreOptions] = useState<InventoryStore[]>([]);

  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);
  const [creatingMovement, setCreatingMovement] = useState(false);
  const [reconcilingReserved, setReconcilingReserved] = useState(false);

  const [searchParam, setSearchParam] = useState('');
  const [skuFilter, setSkuFilter] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedSizeId, setSelectedSizeId] = useState<number | null>(null);
  const [selectedColorId, setSelectedColorId] = useState<number | null>(null);
  const [includeZero, setIncludeZero] = useState(true);
  const [reservedOnly, setReservedOnly] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(0);
  const [stockScope, setStockScope] = useState<InventoryStockScope>('ALL');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const [movementDrawerOpen, setMovementDrawerOpen] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState<Inventory | null>(null);
  const [movementStoreId, setMovementStoreId] = useState<number | null>(null);
  const [movementVariantId, setMovementVariantId] = useState<number | null>(null);
  const [movementVariantSearch, setMovementVariantSearch] = useState('');
  const [movementQuantity, setMovementQuantity] = useState(0);
  const [movementType, setMovementType] = useState<InventoryMovementType>('IN');
  const [movementNote, setMovementNote] = useState('');
  const [movementErrorMessage, setMovementErrorMessage] = useState('');

  const productOptions = useMemo(() => {
    const map = new Map<number, string>();
    inventoryData.forEach((item) => map.set(item.variant.product.id, item.variant.product.name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [inventoryData]);

  const sizeOptions = useMemo(() => {
    const map = new Map<number, string>();
    inventoryData.forEach((item) => map.set(item.variant.size.id, item.variant.size.name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [inventoryData]);

  const colorOptions = useMemo(() => {
    const map = new Map<number, string>();
    inventoryData.forEach((item) => map.set(item.variant.color.id, item.variant.color.name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [inventoryData]);

  const variantCatalog = useMemo<InventoryVariantOption[]>(() => {
    const options: InventoryVariantOption[] = [];
    productCatalog.forEach((product) => {
      (product.variants || []).forEach((variant) => {
        if (variant.isActive === false) {
          return;
        }

        const colorName = variant.color?.name || 'Sin color';
        const sizeName = variant.size?.name || 'Sin talla';
        const sku = variant.sku || `VAR-${variant.id}`;
        options.push({
          variantId: variant.id,
          sku,
          productName: product.name,
          colorName,
          sizeName,
          label: `${product.name} - ${colorName} / ${sizeName} - ${sku}`,
        });
      });
    });
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [productCatalog]);

  const filteredVariantCatalog = useMemo(() => {
    const search = movementVariantSearch.trim().toLowerCase();
    if (!search) {
      return variantCatalog;
    }
    return variantCatalog.filter((variant) =>
      variant.sku.toLowerCase().includes(search)
      || variant.productName.toLowerCase().includes(search)
      || variant.colorName.toLowerCase().includes(search)
      || variant.sizeName.toLowerCase().includes(search));
  }, [variantCatalog, movementVariantSearch]);

  const selectedMovementVariant = useMemo(() => {
    if (!movementVariantId) {
      return null;
    }
    return variantCatalog.find((variant) => variant.variantId === movementVariantId) || null;
  }, [variantCatalog, movementVariantId]);

  const filteredInventories = useMemo(() => {
    const search = searchParam.trim().toLowerCase();
    const skuSearch = skuFilter.trim().toLowerCase();

    return inventoryData.filter((item) => {
      const skuValue = item.variant.sku.toLowerCase();
      const productName = item.variant.product.name.toLowerCase();
      const storeName = item.store.name.toLowerCase();
      const sizeName = item.variant.size.name.toLowerCase();
      const colorName = item.variant.color.name.toLowerCase();
      const availableStock = computeAvailableStock(item);

      const matchesSearch = !search
        || skuValue.includes(search)
        || productName.includes(search)
        || storeName.includes(search)
        || sizeName.includes(search)
        || colorName.includes(search);
      const matchesSku = !skuSearch || skuValue.includes(skuSearch);
      const matchesStore = !selectedStoreId || item.store.id === selectedStoreId;
      const matchesProduct = !selectedProductId || item.variant.product.id === selectedProductId;
      const matchesSize = !selectedSizeId || item.variant.size.id === selectedSizeId;
      const matchesColor = !selectedColorId || item.variant.color.id === selectedColorId;
      const matchesReservedOnly = !reservedOnly || item.reservedStock > 0;
      const matchesZero = includeZero || item.stock > 0;
      const matchesLowStock = lowStockThreshold <= 0 || availableStock <= lowStockThreshold;
      let matchesScope = true;
      if (stockScope === 'OUT') {
        matchesScope = availableStock <= 0;
      } else if (stockScope === 'CRITICAL') {
        matchesScope = availableStock >= 1 && availableStock <= 3;
      } else if (stockScope === 'LOW') {
        matchesScope = availableStock >= 4 && availableStock <= 10;
      } else if (stockScope === 'NORMAL') {
        matchesScope = availableStock > 10;
      }

      return matchesSearch
        && matchesSku
        && matchesStore
        && matchesProduct
        && matchesSize
        && matchesColor
        && matchesReservedOnly
        && matchesZero
        && matchesLowStock
        && matchesScope;
    });
  }, [
    inventoryData,
    searchParam,
    skuFilter,
    selectedStoreId,
    selectedProductId,
    selectedSizeId,
    selectedColorId,
    reservedOnly,
    includeZero,
    lowStockThreshold,
    stockScope,
  ]);

  const mismatchedCount = useMemo(() => {
    return filteredInventories.filter((item) => {
      const tracked = reservationsData
        .filter((reservation) => reservation.inventoryId === item.id && reservation.status === 'ACTIVE')
        .reduce((sum, reservation) => sum + Number(reservation.quantity || 0), 0);
      return Number(item.reservedStock || 0) !== tracked;
    }).length;
  }, [filteredInventories, reservationsData]);

  const canSaveMovement = Boolean(movementStoreId && movementVariantId && movementQuantity > 0 && !creatingMovement);

  async function loadInventories() {
    setIsLoadingInventory(true);
    try {
      const params = new URLSearchParams({
        skip: '1',
        take: '300',
        includeZero: String(includeZero),
      });
      const response = await fetch(`/api/admin/inventory?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { message?: unknown } | null)?.message || 'Error al cargar inventario.'), 'error');
        setInventoryData([]);
        return;
      }
      setInventoryData(normalizeInventoryList(payload));
    } catch {
      showAlert('Error al cargar inventario.', 'error');
      setInventoryData([]);
    } finally {
      setIsLoadingInventory(false);
    }
  }

  async function loadReservations() {
    setIsLoadingReservations(true);
    try {
      const response = await fetch('/api/admin/inventory/reservations', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setReservationsData([]);
        return;
      }
      setReservationsData(normalizeReservations(payload));
    } catch {
      setReservationsData([]);
    } finally {
      setIsLoadingReservations(false);
    }
  }

  async function loadStores() {
    const response = await fetch('/api/admin/stores?skip=1&take=200', {
      method: 'GET',
      cache: 'no-store',
    }).catch(() => null);
    if (!response) {
      setStoreOptions([]);
      return;
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload)) {
      setStoreOptions([]);
      return;
    }
    const stores = (payload as InventoryStore[]).filter((store) => Number.isInteger(Number(store.id)) && String(store.name || '').trim());
    setStoreOptions(stores);
  }

  async function loadProductCatalog() {
    const response = await fetch('/api/admin/products?skip=1&take=500', {
      method: 'GET',
      cache: 'no-store',
    }).catch(() => null);
    if (!response) {
      setProductCatalog([]);
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setProductCatalog([]);
      return;
    }
    setProductCatalog(normalizeProductsForInventoryCatalog(payload));
  }

  useEffect(() => {
    loadInventories();
  }, [includeZero]);

  useEffect(() => {
    loadReservations();
    loadStores();
    loadProductCatalog();
  }, []);

  function openMovementDrawer(item: Inventory, type: InventoryMovementType) {
    setSelectedInventory(item);
    setMovementStoreId(item.store.id);
    setMovementVariantId(item.variant.id);
    setMovementVariantSearch('');
    setMovementType(type);
    setMovementQuantity(0);
    setMovementNote('');
    setMovementErrorMessage('');
    setMovementDrawerOpen(true);
  }

  function openManualMovementDrawer(type: InventoryMovementType = 'IN') {
    setSelectedInventory(null);
    setMovementStoreId(selectedStoreId || null);
    setMovementVariantId(null);
    setMovementVariantSearch('');
    setMovementType(type);
    setMovementQuantity(0);
    setMovementNote('');
    setMovementErrorMessage('');
    setMovementDrawerOpen(true);
  }

  function closeMovementDrawer() {
    setMovementDrawerOpen(false);
    setSelectedInventory(null);
    setMovementErrorMessage('');
  }

  async function saveMovement() {
    if (!canSaveMovement) {
      showAlert('Selecciona tienda, variante y cantidad valida.', 'warning');
      return;
    }

    setMovementErrorMessage('');
    setCreatingMovement(true);
    try {
      const response = await fetch('/api/admin/inventory/movements', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          storeId: movementStoreId,
          variantId: movementVariantId,
          quantity: movementQuantity,
          type: movementType,
          note: movementNote.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMovementErrorMessage(String((payload as { message?: unknown } | null)?.message || 'Error al registrar movimiento.'));
        return;
      }

      showAlert('Movimiento registrado correctamente.', 'success');
      closeMovementDrawer();
      loadInventories();
      loadReservations();
    } catch {
      setMovementErrorMessage('Error al registrar movimiento.');
    } finally {
      setCreatingMovement(false);
    }
  }

  function getTrackedReservedStock(item: Inventory): number {
    return reservationsData
      .filter((reservation) => reservation.inventoryId === item.id && reservation.status === 'ACTIVE')
      .reduce((sum, reservation) => sum + Number(reservation.quantity || 0), 0);
  }

  function getTrackedReservedOrdersCount(item: Inventory): number {
    const ids = new Set<number>();
    reservationsData
      .filter((reservation) => reservation.inventoryId === item.id && reservation.status === 'ACTIVE')
      .forEach((reservation) => {
        const orderId = Number(reservation.orderId || 0);
        if (Number.isInteger(orderId) && orderId > 0) {
          ids.add(orderId);
        }
      });
    return ids.size;
  }

  function hasReservedMismatch(item: Inventory): boolean {
    return Number(item.reservedStock || 0) !== getTrackedReservedStock(item);
  }

  async function reconcileReservedStock(item?: Inventory) {
    if (reconcilingReserved) {
      return;
    }

    const targetIds = item
      ? [item.id]
      : filteredInventories.filter((row) => hasReservedMismatch(row)).map((row) => row.id);

    if (!targetIds.length) {
      showAlert('No hay descuadres de reservados para reconciliar.', 'info');
      return;
    }

    const actionLabel = item ? 'esta variante' : `${targetIds.length} inventario(s)`;
    const accepted = await confirm({
      title: 'Reconciliar reservados',
      message: `Se reconciliara el reservado de ${actionLabel}. Deseas continuar?`,
      acceptText: 'Reconciliar',
      cancelText: 'Cancelar',
    });
    if (!accepted) {
      return;
    }

    setReconcilingReserved(true);
    try {
      const response = await fetch('/api/admin/inventory/reconcile-reserved', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ inventoryIds: targetIds }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { message?: unknown } | null)?.message || 'Error al reconciliar reservados.'), 'error');
        return;
      }

      const adjusted = Number((payload as { adjustedCount?: unknown } | null)?.adjustedCount || 0);
      const unchanged = Number((payload as { unchangedCount?: unknown } | null)?.unchangedCount || 0);
      showAlert(`Reconciliacion completada: ${adjusted} ajustado(s), ${unchanged} sin cambios.`, 'success', 3600);
      loadInventories();
      loadReservations();
    } catch {
      showAlert('Error al reconciliar reservados.', 'error');
    } finally {
      setReconcilingReserved(false);
    }
  }

  function resetFilters() {
    setSearchParam('');
    setSkuFilter('');
    setSelectedStoreId(null);
    setSelectedProductId(null);
    setSelectedSizeId(null);
    setSelectedColorId(null);
    setReservedOnly(false);
    setLowStockThreshold(0);
    setStockScope('ALL');
    setIncludeZero(true);
    setShowAdvancedFilters(false);
  }

  function refreshInventoryContext() {
    loadInventories();
    loadReservations();
  }

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card inventory-header-card">
        <div>
          <p className="section-kicker">Administracion de inventario</p>
          <h1 className="section-title">Inventario</h1>
        </div>
        <div className="inventory-header-actions">
          <Link href="/admin/inventory/movements" className="admin-ghost-btn">Movimientos</Link>
          <Link href="/admin/inventory/traceability" className="admin-ghost-btn">Trazabilidad</Link>
          <Link href="/admin/transfers" className="admin-ghost-btn">Transferencias</Link>
          <button
            type="button"
            className="admin-primary-btn"
            disabled={mismatchedCount === 0 || reconcilingReserved}
            onClick={() => reconcileReservedStock()}
          >
            {reconcilingReserved ? 'Reconciliando...' : `Reconciliar reservados (${mismatchedCount})`}
          </button>
        </div>
      </article>

      <article className="admin-card admin-filters-card-next inventory-filters-card">
        <fieldset className="admin-filters-fieldset-next">
          <legend className="admin-filters-legend-next">Settings</legend>
          <div className="inventory-filter-top">
            <label className="inventory-field">
              <span>Buscar inventario</span>
              <div className="admin-toolbar-join-next inventory-search-join-next">
                <input
                  type="text"
                  value={searchParam}
                  onChange={(event) => setSearchParam(event.target.value)}
                  placeholder="SKU, producto, tienda, color o talla"
                />
                <button type="button" className="admin-primary-btn" onClick={refreshInventoryContext}>
                  Buscar
                </button>
              </div>
            </label>
            <button type="button" className="admin-ghost-btn" onClick={() => setShowAdvancedFilters((value) => !value)}>
              {showAdvancedFilters ? 'Ocultar filtros' : 'Filtros avanzados'}
            </button>
          </div>

          {showAdvancedFilters ? (
            <div className="inventory-advanced-grid">
              <label className="inventory-field">
                <span>SKU</span>
                <input
                  type="text"
                  value={skuFilter}
                  onChange={(event) => setSkuFilter(event.target.value)}
                  placeholder="SKU exacto"
                />
              </label>

              <label className="inventory-field">
                <span>Tienda</span>
                <select
                  value={selectedStoreId || ''}
                  onChange={(event) => setSelectedStoreId(toPositiveInt(event.target.value))}
                >
                  <option value="">Todas las tiendas</option>
                  {storeOptions.map((store) => (
                    <option key={store.id} value={store.id}>{store.name} ({store.code})</option>
                  ))}
                </select>
              </label>

              <label className="inventory-field">
                <span>Producto</span>
                <select
                  value={selectedProductId || ''}
                  onChange={(event) => setSelectedProductId(toPositiveInt(event.target.value))}
                >
                  <option value="">Todos</option>
                  {productOptions.map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
              </label>

              <label className="inventory-field">
                <span>Talla</span>
                <select
                  value={selectedSizeId || ''}
                  onChange={(event) => setSelectedSizeId(toPositiveInt(event.target.value))}
                >
                  <option value="">Todas</option>
                  {sizeOptions.map((size) => (
                    <option key={size.id} value={size.id}>{size.name}</option>
                  ))}
                </select>
              </label>

              <label className="inventory-field">
                <span>Color</span>
                <select
                  value={selectedColorId || ''}
                  onChange={(event) => setSelectedColorId(toPositiveInt(event.target.value))}
                >
                  <option value="">Todos</option>
                  {colorOptions.map((color) => (
                    <option key={color.id} value={color.id}>{color.name}</option>
                  ))}
                </select>
              </label>

              <label className="inventory-field">
                <span>Estado de stock</span>
                <select
                  value={stockScope}
                  onChange={(event) => setStockScope(event.target.value as InventoryStockScope)}
                >
                  <option value="ALL">Todos</option>
                  <option value="OUT">Sin stock</option>
                  <option value="CRITICAL">Critico (1-3)</option>
                  <option value="LOW">Bajo (4-10)</option>
                  <option value="NORMAL">Normal</option>
                </select>
              </label>

              <label className="inventory-field">
                <span>Stock disponible {'<='}</span>
                <input
                  type="number"
                  min={0}
                  value={lowStockThreshold}
                  onChange={(event) => setLowStockThreshold(Math.max(0, Number(event.target.value) || 0))}
                />
              </label>

              <label className="admin-checkbox">
                <input type="checkbox" checked={includeZero} onChange={(event) => setIncludeZero(event.target.checked)} />
                Mostrar stock cero
              </label>

              <label className="admin-checkbox">
                <input type="checkbox" checked={reservedOnly} onChange={(event) => setReservedOnly(event.target.checked)} />
                Solo reservados
              </label>

              <div className="inventory-filter-actions">
                <button type="button" className="admin-ghost-btn" onClick={refreshInventoryContext}>Actualizar</button>
                <button type="button" className="admin-ghost-btn" onClick={resetFilters}>Limpiar filtros</button>
              </div>
            </div>
          ) : null}

          <div className="inventory-summary-card">
            <p>Mostrando <strong>{filteredInventories.length}</strong> de <strong>{inventoryData.length}</strong> inventarios.</p>
            <p className="admin-muted-text">Usa busqueda y filtros para refinar el listado.</p>
          </div>
        </fieldset>
      </article>

      <article className="admin-card inventory-quick-card">
        <p className="inventory-quick-title">Registro rapido</p>
        <p className="admin-muted-text">Puedes registrar por fila o crear inventario nuevo eligiendo tienda y variante.</p>
        <div className="inventory-quick-actions">
          <button type="button" className="admin-primary-btn" onClick={() => openManualMovementDrawer('IN')}>
            Nuevo ingreso manual
          </button>
          <Link href="/admin/inventory/movements" className="admin-ghost-btn">
            Ir a movimientos
          </Link>
        </div>
      </article>

      <article className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Producto</th>
                <th>Variante / SKU</th>
                <th>Tienda</th>
                <th>Disponible</th>
                <th>Reservado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingInventory ? (
                <tr>
                  <td colSpan={7} data-label="Estado">Cargando inventario...</td>
                </tr>
              ) : filteredInventories.length === 0 ? (
                <tr>
                  <td colSpan={7} data-label="Estado">No hay inventarios para los filtros actuales.</td>
                </tr>
              ) : (
                filteredInventories.map((item, index) => (
                  <tr key={item.id}>
                    <td data-label="#">{index + 1}</td>
                    <td data-label="Producto">
                      <div>
                        <strong>{item.variant.product.name}</strong>
                        <br />
                        <small>{item.variant.size.name} - {item.variant.color.name}</small>
                      </div>
                    </td>
                    <td data-label="SKU">{item.variant.sku}</td>
                    <td data-label="Tienda">{item.store.name}</td>
                    <td data-label="Disponible">{computeAvailableStock(item)}</td>
                    <td data-label="Reservado">
                      <div>
                        <strong>{item.reservedStock}</strong>
                        <br />
                        <small>Trazado: {getTrackedReservedStock(item)} en {getTrackedReservedOrdersCount(item)} pedido(s)</small>
                        {hasReservedMismatch(item) ? (
                          <>
                            <br />
                            <span className="inventory-warning-text">Descuadre entre inventario y reservas activas</span>
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td data-label="Accion">
                      <details className="inventory-actions-menu-next">
                        <summary className="inventory-actions-trigger-next" aria-label="Abrir acciones">
                          ⋮
                        </summary>
                        <div className="inventory-actions-list-next">
                          <button type="button" onClick={() => openMovementDrawer(item, 'IN')}>
                            Ingreso
                          </button>
                          <button type="button" onClick={() => openMovementDrawer(item, 'OUT')}>
                            Salida
                          </button>
                          <button type="button" onClick={() => openMovementDrawer(item, 'ADJUSTMENT')}>
                            Ajuste
                          </button>
                          <button type="button" onClick={() => router.push(`/admin/inventory/movements?inventoryId=${item.id}`)}>
                            Ver movimientos
                          </button>
                          <button type="button" onClick={() => router.push(`/admin/inventory/traceability?inventoryId=${item.id}`)}>
                            Ver trazabilidad
                          </button>
                          {hasReservedMismatch(item) ? (
                            <button
                              type="button"
                              disabled={reconcilingReserved}
                              onClick={() => reconcileReservedStock(item)}
                            >
                              Reconciliar reservado
                            </button>
                          ) : null}
                        </div>
                      </details>
                      {hasReservedMismatch(item) ? (
                        <div className="inventory-row-warning-next">
                          Descuadre
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {movementDrawerOpen ? (
        <>
          <div className="admin-modal-overlay inventory-drawer-overlay" onClick={closeMovementDrawer} />
          <aside className="inventory-movement-drawer">
            <div className="inventory-drawer-head">
              <div>
                <h3>Registrar movimiento</h3>
                {selectedInventory ? (
                  <>
                    <p>{selectedInventory.variant.product.name} - {selectedInventory.variant.sku}</p>
                    <p>Tienda: {selectedInventory.store.name}</p>
                  </>
                ) : selectedMovementVariant ? (
                  <p>{selectedMovementVariant.productName} - {selectedMovementVariant.sku}</p>
                ) : null}
              </div>
              <button type="button" className="admin-ghost-btn" onClick={closeMovementDrawer}>Cerrar</button>
            </div>

            {movementErrorMessage ? (
              <p className="admin-feedback error">{movementErrorMessage}</p>
            ) : null}

            <div className="inventory-drawer-body">
              <label className="inventory-field">
                <span>Tipo de movimiento</span>
                <select
                  value={movementType}
                  onChange={(event) => setMovementType(event.target.value as InventoryMovementType)}
                >
                  <option value="IN">Ingreso</option>
                  <option value="OUT">Salida</option>
                  <option value="ADJUSTMENT">Ajuste</option>
                </select>
              </label>

              <label className="inventory-field">
                <span>Tienda destino</span>
                <select
                  value={movementStoreId || ''}
                  onChange={(event) => setMovementStoreId(toPositiveInt(event.target.value))}
                >
                  <option value="">Selecciona una tienda</option>
                  {storeOptions.map((store) => (
                    <option key={store.id} value={store.id}>{store.name} ({store.code})</option>
                  ))}
                </select>
              </label>

              <label className="inventory-field">
                <span>Buscar variante</span>
                <input
                  type="text"
                  value={movementVariantSearch}
                  onChange={(event) => setMovementVariantSearch(event.target.value)}
                  placeholder="SKU, producto, color o talla"
                />
              </label>

              <label className="inventory-field">
                <span>Variante</span>
                <select
                  value={movementVariantId || ''}
                  onChange={(event) => setMovementVariantId(toPositiveInt(event.target.value))}
                >
                  <option value="">Selecciona una variante</option>
                  {filteredVariantCatalog.map((variant) => (
                    <option key={variant.variantId} value={variant.variantId}>{variant.label}</option>
                  ))}
                </select>
              </label>

              {selectedMovementVariant ? (
                <div className="inventory-summary-card">
                  <p className="inventory-quick-title">Variante seleccionada</p>
                  <p>{selectedMovementVariant.productName}</p>
                  <p className="admin-muted-text">
                    {selectedMovementVariant.colorName} / {selectedMovementVariant.sizeName} - {selectedMovementVariant.sku}
                  </p>
                </div>
              ) : null}

              <label className="inventory-field">
                <span>Cantidad</span>
                <input
                  type="number"
                  min={1}
                  value={movementQuantity}
                  onChange={(event) => setMovementQuantity(Math.max(0, Number(event.target.value) || 0))}
                />
              </label>

              <label className="inventory-field">
                <span>Nota</span>
                <input
                  type="text"
                  value={movementNote}
                  onChange={(event) => setMovementNote(event.target.value)}
                  placeholder="Ej. ajuste de conteo o motivo"
                />
              </label>
            </div>

            <div className="inventory-drawer-foot">
              <button type="button" className="admin-primary-btn" disabled={!canSaveMovement} onClick={saveMovement}>
                {creatingMovement ? 'Guardando...' : 'Guardar movimiento'}
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}
