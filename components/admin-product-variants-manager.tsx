'use client';

import { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, useMemo, useState } from 'react';
import {
  AdminColorOption,
  AdminProductDetail,
  AdminSizeOption,
  ProductVariantMode,
} from '@/components/admin-product-modal';
import { AdminSelect } from '@/components/admin-select';
import { useAdminUi } from '@/components/admin-ui-provider';
import { Inventory, InventoryStore } from '@/lib/admin-inventory-types';
import {
  buildVariantPayload,
  parseVariantMode,
  toNumber,
  toPositiveNumber,
  uniqueNumbers,
} from '@/lib/product-form-utils';

interface VariantForm {
  id?: number;
  sku?: string;
  colorId: number;
  sizeId: number;
  price: number;
  isActive: boolean;
  imageUrl?: string;
  imageFile?: File;
  imagePreview?: string;
}

interface AdminProductVariantsManagerProps {
  productId: number;
  product: AdminProductDetail;
  colors: AdminColorOption[];
  sizes: AdminSizeOption[];
  stores: InventoryStore[];
  inventoryRows: Inventory[];
  onSaved: () => void;
}

function variantKey(colorId: number, sizeId: number): string {
  return `${colorId}-${sizeId}`;
}

function getVariantPreview(variant: VariantForm): string {
  return String(variant.imagePreview || variant.imageUrl || '').trim();
}

function mapProductVariants(product: AdminProductDetail, mode: ProductVariantMode): VariantForm[] {
  const raw = Array.isArray(product.variants) ? product.variants : [];
  return raw.map((variant) => ({
    id: toPositiveNumber(variant.id) || undefined,
    sku: String(variant.sku || '') || undefined,
    colorId: mode === 'MATRIX' ? toPositiveNumber(variant.colorId) : 0,
    sizeId: mode === 'SIMPLE' ? 0 : toPositiveNumber(variant.sizeId),
    price: toNumber(variant.price),
    isActive: variant.isActive !== false,
    imageUrl: String(variant.imageUrl || '') || undefined,
    imagePreview: String(variant.imageUrl || '') || undefined,
  }));
}

export function AdminProductVariantsManager({
  productId,
  product,
  colors,
  sizes,
  stores,
  inventoryRows,
  onSaved,
}: AdminProductVariantsManagerProps) {
  const { confirm, showAlert } = useAdminUi();
  const mode = parseVariantMode(product.variantMode);

  const [variants, setVariants] = useState<VariantForm[]>(() => {
    const mapped = mapProductVariants(product, mode);
    if (mode === 'SIMPLE' && mapped.length === 0) {
      return [{ colorId: 0, sizeId: 0, price: 0, isActive: true }];
    }
    return mapped;
  });
  const [selectedColorIds, setSelectedColorIds] = useState<number[]>(() =>
    uniqueNumbers((product.variants || []).map((variant) => toPositiveNumber(variant.colorId))),
  );
  const [selectedSizeIds, setSelectedSizeIds] = useState<number[]>(() =>
    uniqueNumbers((product.variants || []).map((variant) => toPositiveNumber(variant.sizeId))),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  // Carga inicial de stock.
  const [loadStoreId, setLoadStoreId] = useState<number | null>(() => stores[0]?.id ?? null);
  const [loadQty, setLoadQty] = useState<Record<number, number>>({});
  const [isLoadingStock, setIsLoadingStock] = useState(false);

  const isSimple = mode === 'SIMPLE';
  const isSizeOnly = mode === 'SIZE_ONLY';
  const isMatrix = mode === 'MATRIX';

  function getColorName(colorId: number): string {
    return colors.find((color) => color.id === colorId)?.name || `Color #${colorId}`;
  }

  function getColorHex(colorId: number): string | null {
    return colors.find((color) => color.id === colorId)?.hex || null;
  }

  function getSizeName(sizeId: number): string {
    return sizes.find((size) => size.id === sizeId)?.name || `Talla #${sizeId}`;
  }

  // Stock / reservado por variante (sumado por tienda) y por variante+tienda.
  const stockByVariantId = useMemo(() => {
    const map: Record<number, number> = {};
    inventoryRows.forEach((row) => {
      map[row.variant.id] = (map[row.variant.id] || 0) + Number(row.stock || 0);
    });
    return map;
  }, [inventoryRows]);

  const reservedByVariantId = useMemo(() => {
    const map: Record<number, number> = {};
    inventoryRows.forEach((row) => {
      map[row.variant.id] = (map[row.variant.id] || 0) + Number(row.reservedStock || 0);
    });
    return map;
  }, [inventoryRows]);

  const stockByVariantStore = useMemo(() => {
    const map: Record<string, number> = {};
    inventoryRows.forEach((row) => {
      map[`${row.variant.id}-${row.store.id}`] = Number(row.stock || 0);
    });
    return map;
  }, [inventoryRows]);

  // Identidad original por (color,talla) -> id, para detectar bajas al guardar.
  const originalIdByKey = useMemo(() => {
    const map = new Map<string, number>();
    mapProductVariants(product, mode).forEach((variant) => {
      if (variant.id) {
        map.set(variantKey(variant.colorId, variant.sizeId), variant.id);
      }
    });
    return map;
  }, [product, mode]);

  function stockReservedForKey(colorId: number, sizeId: number): { stock: number; reserved: number } {
    const id = originalIdByKey.get(variantKey(colorId, sizeId));
    if (!id) {
      return { stock: 0, reserved: 0 };
    }
    return { stock: stockByVariantId[id] || 0, reserved: reservedByVariantId[id] || 0 };
  }

  // Orden estable segun catalogos.
  const colorOrder = useMemo(() => new Map(colors.map((color, index) => [color.id, index])), [colors]);
  const sizeOrder = useMemo(() => new Map(sizes.map((size, index) => [size.id, index])), [sizes]);

  const gridColorIds = useMemo(() => (
    uniqueNumbers(variants.map((variant) => variant.colorId))
      .sort((a, b) => (colorOrder.get(a) ?? 0) - (colorOrder.get(b) ?? 0))
  ), [variants, colorOrder]);

  const gridSizeIds = useMemo(() => (
    uniqueNumbers(variants.map((variant) => variant.sizeId))
      .sort((a, b) => (sizeOrder.get(a) ?? 0) - (sizeOrder.get(b) ?? 0))
  ), [variants, sizeOrder]);

  const variantByKey = useMemo(() => {
    const map = new Map<string, { variant: VariantForm; index: number }>();
    variants.forEach((variant, index) => map.set(variantKey(variant.colorId, variant.sizeId), { variant, index }));
    return map;
  }, [variants]);

  function setPrice(index: number, value: string) {
    const parsed = Number(value);
    setVariants((current) => current.map((variant, idx) => (
      idx === index ? { ...variant, price: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0 } : variant
    )));
    setError('');
  }

  function setActive(index: number, checked: boolean) {
    setVariants((current) => current.map((variant, idx) => (
      idx === index ? { ...variant, isActive: checked } : variant
    )));
  }

  function setBulkPriceAll(value: string) {
    const parsed = Number(value);
    const price = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setVariants((current) => current.map((variant) => ({ ...variant, price })));
    setError('');
  }

  function setBulkPriceColor(colorId: number, value: string) {
    const parsed = Number(value);
    const price = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setVariants((current) => current.map((variant) => (
      variant.colorId === colorId ? { ...variant, price } : variant
    )));
    setError('');
  }

  function onVariantImageChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const preview = URL.createObjectURL(file);
    setVariants((current) => current.map((variant, idx) => (
      idx === index ? {
        ...variant,
        imageUrl: undefined,
        imageFile: file,
        imagePreview: preview,
      } : variant
    )));
    event.target.value = '';
  }

  function removeVariantImage(index: number) {
    setVariants((current) => current.map((variant, idx) => (
      idx === index ? {
        ...variant,
        imageFile: undefined, imageUrl: undefined, imagePreview: undefined,
      } : variant
    )));
  }

  function onColorImageChange(colorId: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const preview = URL.createObjectURL(file);
    setVariants((current) => current.map((variant) => (
      variant.colorId === colorId ? {
        ...variant,
        imageUrl: undefined, imageFile: file, imagePreview: preview,
      } : variant
    )));
    event.target.value = '';
  }

  function removeColorImage(colorId: number) {
    setVariants((current) => current.map((variant) => (
      variant.colorId === colorId
        ? {
          ...variant,
          imageFile: undefined, imageUrl: undefined, imagePreview: undefined,
        }
        : variant
    )));
  }

  // SIZE_ONLY: alternar talla agrega/quita fila; con guard si ya tiene stock/reservas.
  async function toggleSizeOnly(sizeId: number, checked: boolean) {
    setError('');
    if (!checked) {
      const { stock, reserved } = stockReservedForKey(0, sizeId);
      if (stock > 0 || reserved > 0) {
        const ok = await confirm({
          title: 'Talla con stock/reservas',
          message: `La talla ${getSizeName(sizeId)} tiene ${stock} en stock y ${reserved} reservada(s). Se desactivara (no se elimina) al guardar y su stock quedara en una variante inactiva. Deseas continuar?`,
          acceptText: 'Quitar',
          cancelText: 'Cancelar',
        });
        if (!ok) {
          return;
        }
      }
      setSelectedSizeIds((current) => current.filter((id) => id !== sizeId));
      setVariants((current) => current.filter((variant) => variant.sizeId !== sizeId));
      return;
    }

    setSelectedSizeIds((current) => uniqueNumbers([...current, sizeId]));
    setVariants((current) => (
      current.some((variant) => variant.sizeId === sizeId)
        ? current
        : [...current, { colorId: 0, sizeId, price: 0, isActive: true }]
    ));
  }

  function toggleMatrixColor(colorId: number, checked: boolean) {
    setError('');
    setSelectedColorIds((current) => uniqueNumbers(checked ? [...current, colorId] : current.filter((id) => id !== colorId)));
  }

  function toggleMatrixSize(sizeId: number, checked: boolean) {
    setError('');
    setSelectedSizeIds((current) => uniqueNumbers(checked ? [...current, sizeId] : current.filter((id) => id !== sizeId)));
  }

  // MATRIX: sincroniza la matriz conservando lo editado y descartando lo deseleccionado.
  async function generateMatrix() {
    setError('');
    if (!selectedColorIds.length || !selectedSizeIds.length) {
      setError('Selecciona al menos un color y una talla.');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/admin/products/generate-variants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ colorIds: selectedColorIds, sizeIds: selectedSizeIds }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(String((payload as { message?: unknown } | null)?.message || 'No se pudieron generar las combinaciones.'));
        return;
      }

      const combos = ((payload as { variants?: Array<{ colorId?: number; sizeId?: number }> } | null)?.variants || [])
        .map((item) => ({ colorId: toPositiveNumber(item.colorId), sizeId: toPositiveNumber(item.sizeId) }))
        .filter((item) => item.colorId > 0 && item.sizeId > 0);

      setVariants((current) => {
        const byKey = new Map(current.map((variant) => [variantKey(variant.colorId, variant.sizeId), variant]));
        return combos.map((combo) => byKey.get(variantKey(combo.colorId, combo.sizeId)) || {
          colorId: combo.colorId,
          sizeId: combo.sizeId,
          price: 0,
          isActive: true,
        });
      });
    } catch {
      setError('No se pudieron generar las combinaciones.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function removeColorGroup(colorId: number) {
    const affected = variants.filter((variant) => variant.colorId === colorId);
    const totalStock = affected.reduce((sum, variant) => sum + stockReservedForKey(colorId, variant.sizeId).stock, 0);
    const totalReserved = affected.reduce((sum, variant) => sum + stockReservedForKey(colorId, variant.sizeId).reserved, 0);
    const extra = totalStock > 0 || totalReserved > 0
      ? ` Tiene ${totalStock} en stock y ${totalReserved} reservada(s); se desactivaran (no se eliminan) al guardar.`
      : '';

    const accepted = await confirm({
      title: 'Quitar color',
      message: `Se quitaran todas las tallas del color "${getColorName(colorId)}".${extra} Deseas continuar?`,
      acceptText: 'Quitar',
      cancelText: 'Cancelar',
    });
    if (!accepted) {
      return;
    }
    setSelectedColorIds((current) => current.filter((id) => id !== colorId));
    setVariants((current) => current.filter((variant) => variant.colorId !== colorId));
  }

  function onMatrixCellKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, colorId: number, sizeId: number) {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const position = gridColorIds.indexOf(colorId);
    const nextColorId = gridColorIds[position + 1] ?? gridColorIds[0];
    const next = document.querySelector<HTMLInputElement>(`[data-mprice="${nextColorId}-${sizeId}"]`);
    if (next) {
      next.focus();
      next.select();
    }
  }

  async function handleSave() {
    setError('');

    if (!variants.length) {
      setError(isSimple ? 'Configura el precio de la variante.' : 'Agrega al menos una variante.');
      return;
    }

    if (variants.some((variant) => toNumber(variant.price) <= 0)) {
      setError('Cada variante debe tener un precio mayor que 0.');
      return;
    }

    // Guard: variantes que se dan de baja (quitadas del set) y aun tienen stock/reservas.
    const currentKeys = new Set(variants.map((variant) => variantKey(variant.colorId, variant.sizeId)));
    const removedWithStock = mapProductVariants(product, mode)
      .filter((variant) => variant.id && !currentKeys.has(variantKey(variant.colorId, variant.sizeId)))
      .map((variant) => ({
        variant,
        stock: stockByVariantId[variant.id as number] || 0,
        reserved: reservedByVariantId[variant.id as number] || 0,
      }))
      .filter((entry) => entry.stock > 0 || entry.reserved > 0);

    let confirmMessage = 'Se reemplazaran las variantes activas del producto con esta configuracion. Deseas guardar?';
    if (removedWithStock.length) {
      const detail = removedWithStock
        .slice(0, 6)
        .map((entry) => {
          const label = isSimple
            ? 'Unico'
            : isSizeOnly
              ? getSizeName(entry.variant.sizeId)
              : `${getColorName(entry.variant.colorId)} / ${getSizeName(entry.variant.sizeId)}`;
          return `• ${label}: ${entry.stock} stock, ${entry.reserved} reservada(s)`;
        })
        .join('\n');
      const more = removedWithStock.length > 6 ? `\n… y ${removedWithStock.length - 6} mas.` : '';
      confirmMessage = `Se desactivaran ${removedWithStock.length} variante(s) que aun tienen stock o reservas (no se eliminan; el stock queda en la variante inactiva):\n${detail}${more}\n\nDeseas guardar de todas formas?`;
    }

    const accepted = await confirm({
      title: 'Guardar variantes',
      message: confirmMessage,
      acceptText: 'Guardar',
      cancelText: 'Cancelar',
    });
    if (!accepted) {
      return;
    }

    setIsSaving(true);
    try {
      const payloadVariants = await buildVariantPayload(variants, mode);
      // Derivar de las variantes reales garantiza consistencia con lo que se envia.
      const body: Record<string, unknown> = {
        variantMode: mode,
        colorIds: isMatrix ? uniqueNumbers(variants.map((variant) => variant.colorId)) : [],
        sizeIds: isSimple ? [] : uniqueNumbers(variants.map((variant) => variant.sizeId)),
        variants: payloadVariants,
      };

      const response = await fetch(`/api/admin/products/${productId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = String((payload as { message?: unknown } | null)?.message || 'No se pudieron guardar las variantes.');
        setError(message);
        showAlert(message, 'error');
        return;
      }

      showAlert('Variantes actualizadas correctamente.', 'success');
      onSaved();
    } catch {
      setError('No se pudieron guardar las variantes.');
      showAlert('No se pudieron guardar las variantes.', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  // ==== Carga inicial de stock (movimientos IN, auditados) =================
  const persistedVariants = useMemo(() => variants.filter((variant) => variant.id), [variants]);
  const pendingStockUnits = useMemo(
    () => Object.values(loadQty).reduce((sum, qty) => sum + Math.max(0, Number(qty) || 0), 0),
    [loadQty],
  );

  function variantLabel(variant: VariantForm): string {
    if (isSimple) {
      return 'Producto unico';
    }
    if (isSizeOnly) {
      return getSizeName(variant.sizeId);
    }
    return `${getColorName(variant.colorId)} / ${getSizeName(variant.sizeId)}`;
  }

  async function registerInitialStock() {
    setError('');
    if (!loadStoreId) {
      showAlert('Selecciona una tienda para cargar stock.', 'warning');
      return;
    }

    const targets = persistedVariants
      .map((variant) => ({ variant, qty: Math.max(0, Number(loadQty[variant.id as number]) || 0) }))
      .filter((entry) => entry.qty > 0);

    if (!targets.length) {
      showAlert('Ingresa cantidades a cargar.', 'warning');
      return;
    }

    const storeName = stores.find((store) => store.id === loadStoreId)?.name || `tienda ${loadStoreId}`;
    const accepted = await confirm({
      title: 'Cargar stock inicial',
      message: `Se registraran ${targets.length} ingreso(s) (${pendingStockUnits} und.) en ${storeName}. Cada uno queda como movimiento auditado. Deseas continuar?`,
      acceptText: 'Registrar',
      cancelText: 'Cancelar',
    });
    if (!accepted) {
      return;
    }

    setIsLoadingStock(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const entry of targets) {
        const response = await fetch('/api/admin/inventory/movements', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            storeId: loadStoreId,
            variantId: entry.variant.id,
            quantity: entry.qty,
            type: 'IN',
            note: 'Carga inicial de stock',
          }),
        }).catch(() => null);
        if (response && response.ok) {
          ok += 1;
        } else {
          failed += 1;
        }
      }

      if (ok > 0) {
        showAlert(`Stock cargado: ${ok} ingreso(s)${failed ? `, ${failed} con error` : ''}.`, failed ? 'warning' : 'success');
        setLoadQty({});
        onSaved();
      } else {
        showAlert('No se pudo cargar el stock.', 'error');
      }
    } finally {
      setIsLoadingStock(false);
    }
  }

  return (
    <article className="admin-card admin-variants-manager-next">
      <div className="admin-variants-manager-head-next">
        <div>
          <h2 className="section-title">Administrar variantes</h2>
          <p className="admin-muted-text">
            {isSimple
              ? 'Producto unico: configura precio, estado e imagen.'
              : isSizeOnly
                ? 'Producto con talla: agrega tallas y define precio e imagen por talla.'
                : 'Producto con talla y color: administra la matriz de combinaciones.'}
          </p>
        </div>
      </div>

      {error ? <p className="admin-modal-error">{error}</p> : null}

      {/* SIMPLE ---------------------------------------------------------- */}
      {isSimple ? (
        <div className="admin-variants-simple-next">
          <label className="admin-field-block">
            <span>Precio</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={toNumber(variants[0]?.price)}
              onChange={(event) => setPrice(0, event.target.value)}
            />
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={variants[0]?.isActive !== false}
              onChange={(event) => setActive(0, event.target.checked)}
            />
            Variante activa
          </label>
          <div className="admin-color-image-card">
            <div className="admin-color-image-thumb">
              {getVariantPreview(variants[0]) ? (
                <img src={getVariantPreview(variants[0])} alt="Imagen del producto" />
              ) : (
                <span className="admin-color-image-thumb-empty">Sin<br />imagen</span>
              )}
            </div>
            <div className="admin-color-image-actions">
              <label className="admin-file-picker-next">
                <span>{getVariantPreview(variants[0]) ? 'Cambiar imagen' : 'Seleccionar imagen'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onVariantImageChange(0, event)} />
              </label>
              {getVariantPreview(variants[0]) ? (
                <button type="button" className="admin-ghost-btn" onClick={() => removeVariantImage(0)}>Quitar</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* SIZE_ONLY ------------------------------------------------------- */}
      {isSizeOnly ? (
        <div className="admin-variants-sizeonly-next">
          <section className="admin-product-select-box">
            <h5>Tallas</h5>
            <div className="admin-chip-grid">
              {sizes.map((size) => {
                const checked = selectedSizeIds.includes(size.id);
                return (
                  <label key={size.id} className={`admin-chip${checked ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={(event) => toggleSizeOnly(size.id, event.target.checked)} />
                    <span>{size.name}</span>
                  </label>
                );
              })}
            </div>
          </section>

          {variants.length ? (
            <>
              <div className="admin-variants-bulk-next">
                <span>Precio a todas</span>
                <input type="number" min="0" step="0.01" placeholder="S/" onChange={(event) => setBulkPriceAll(event.target.value)} />
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table admin-table-sm">
                  <thead>
                    <tr>
                      <th>Talla</th>
                      <th>Precio</th>
                      <th>Activo</th>
                      <th>Imagen</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((variant, index) => (
                      <tr key={`${variant.sizeId}-${index}`}>
                        <td data-label="Talla">{getSizeName(variant.sizeId)}</td>
                        <td data-label="Precio">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={toNumber(variant.price)}
                            className={toNumber(variant.price) <= 0 ? 'admin-field-invalid' : undefined}
                            onChange={(event) => setPrice(index, event.target.value)}
                          />
                        </td>
                        <td data-label="Activo">
                          <input type="checkbox" checked={variant.isActive !== false} onChange={(event) => setActive(index, event.target.checked)} />
                        </td>
                        <td data-label="Imagen">
                          <div className="admin-variants-img-cell-next">
                            {getVariantPreview(variant) ? <img src={getVariantPreview(variant)} alt={`Talla ${getSizeName(variant.sizeId)}`} /> : null}
                            <label className="admin-file-picker-next">
                              <span>{getVariantPreview(variant) ? 'Cambiar' : 'Imagen'}</span>
                              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onVariantImageChange(index, event)} />
                            </label>
                            {getVariantPreview(variant) ? (
                              <button type="button" className="admin-ghost-btn admin-btn-sm" onClick={() => removeVariantImage(index)}>Quitar</button>
                            ) : null}
                          </div>
                        </td>
                        <td data-label="Accion">
                          <button type="button" className="admin-ghost-btn admin-btn-sm" onClick={() => toggleSizeOnly(variant.sizeId, false)}>Quitar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="admin-muted-text">Selecciona tallas para empezar.</p>
          )}
        </div>
      ) : null}

      {/* MATRIX (grilla talla x color) ---------------------------------- */}
      {isMatrix ? (
        <div className="admin-variants-matrix-next">
          <div className="admin-product-selection-grid">
            <section className="admin-product-select-box">
              <h5>Colores</h5>
              <div className="admin-chip-grid">
                {colors.map((color) => {
                  const checked = selectedColorIds.includes(color.id);
                  const hex = color.hex || null;
                  return (
                    <label key={color.id} className={`admin-chip admin-chip--color${checked ? ' is-on' : ''}`}>
                      <input type="checkbox" checked={checked} onChange={(event) => toggleMatrixColor(color.id, event.target.checked)} />
                      {hex ? <span className="admin-chip-swatch" style={{ background: hex }} /> : null}
                      <span>{color.name}</span>
                    </label>
                  );
                })}
              </div>
            </section>
            <section className="admin-product-select-box">
              <h5>Tallas</h5>
              <div className="admin-chip-grid">
                {sizes.map((size) => {
                  const checked = selectedSizeIds.includes(size.id);
                  return (
                    <label key={size.id} className={`admin-chip${checked ? ' is-on' : ''}`}>
                      <input type="checkbox" checked={checked} onChange={(event) => toggleMatrixSize(size.id, event.target.checked)} />
                      <span>{size.name}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="admin-product-inline-actions">
            <button type="button" className="admin-primary-btn" onClick={generateMatrix} disabled={isGenerating || isSaving}>
              {isGenerating ? 'Generando...' : 'Generar/actualizar matriz'}
            </button>
            <div className="admin-variants-bulk-next">
              <span>Precio a toda la matriz</span>
              <input type="number" min="0" step="0.01" placeholder="S/" onChange={(event) => setBulkPriceAll(event.target.value)} />
            </div>
            <span className="admin-chip-count">{variants.length} variantes</span>
          </div>

          {gridColorIds.length && gridSizeIds.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table admin-table-sm admin-matrix-table-next">
                <thead>
                  <tr>
                    <th className="admin-matrix-corner-next">Color \ Talla</th>
                    {gridSizeIds.map((sizeId) => <th key={sizeId}>{getSizeName(sizeId)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {gridColorIds.map((colorId) => {
                    const hex = getColorHex(colorId);
                    const rowVariant = variants.find((variant) => variant.colorId === colorId);
                    const preview = rowVariant ? getVariantPreview(rowVariant) : '';
                    return (
                      <tr key={colorId}>
                        <th scope="row" className="admin-matrix-rowhead-next">
                          <div className="admin-matrix-rowhead-top-next">
                            {hex ? <span className="admin-chip-swatch" style={{ background: hex }} /> : null}
                            <span className="admin-matrix-color-name-next">{getColorName(colorId)}</span>
                            <button type="button" className="admin-matrix-remove-next" aria-label={`Quitar ${getColorName(colorId)}`} onClick={() => removeColorGroup(colorId)}>×</button>
                          </div>
                          <div className="admin-matrix-rowhead-tools-next">
                            <input type="number" min="0" step="0.01" placeholder="S/ fila" onChange={(event) => setBulkPriceColor(colorId, event.target.value)} />
                            <label className="admin-matrix-img-btn-next" title="Imagen del color">
                              {preview ? <img src={preview} alt={getColorName(colorId)} /> : <span>img</span>}
                              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onColorImageChange(colorId, event)} />
                            </label>
                            {preview ? (
                              <button type="button" className="admin-ghost-btn admin-btn-sm" onClick={() => removeColorImage(colorId)}>Quitar img</button>
                            ) : null}
                          </div>
                        </th>
                        {gridSizeIds.map((sizeId) => {
                          const entry = variantByKey.get(variantKey(colorId, sizeId));
                          if (!entry) {
                            return <td key={sizeId} className="admin-matrix-empty-next">—</td>;
                          }
                          const { variant, index } = entry;
                          return (
                            <td key={sizeId} className={variant.isActive === false ? 'admin-matrix-cell-off-next' : undefined}>
                              <div className="admin-matrix-cell-next">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={toNumber(variant.price)}
                                  data-mprice={`${colorId}-${sizeId}`}
                                  className={toNumber(variant.price) <= 0 ? 'admin-field-invalid' : undefined}
                                  onChange={(event) => setPrice(index, event.target.value)}
                                  onKeyDown={(event) => onMatrixCellKeyDown(event, colorId, sizeId)}
                                />
                                <input
                                  type="checkbox"
                                  title="Activo"
                                  checked={variant.isActive !== false}
                                  onChange={(event) => setActive(index, event.target.checked)}
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-muted-text">Selecciona colores y tallas y genera la matriz.</p>
          )}
        </div>
      ) : null}

      <div className="admin-modal-actions admin-variants-manager-foot-next">
        <button type="button" className="admin-primary-btn admin-submit-btn-next" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Guardando...' : 'Guardar variantes'}
        </button>
      </div>

      {/* Carga inicial de stock ----------------------------------------- */}
      <details className="admin-variants-stockload-next">
        <summary>Cargar stock inicial (ingreso auditado)</summary>
        <div className="admin-variants-stockload-body-next">
          {persistedVariants.length === 0 ? (
            <p className="admin-muted-text">Guarda las variantes primero para poder cargar su stock.</p>
          ) : stores.length === 0 ? (
            <p className="admin-muted-text">No hay tiendas disponibles.</p>
          ) : (
            <>
              <div className="admin-field-block admin-variants-stockload-store-next">
                <span>Tienda</span>
                <AdminSelect
                  value={String(loadStoreId || '')}
                  options={stores.map((store) => ({ value: String(store.id), label: `${store.name} (${store.code})` }))}
                  ariaLabel="Tienda para cargar stock"
                  onChange={(nextValue) => setLoadStoreId(toPositiveNumber(nextValue) || null)}
                />
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table admin-table-sm">
                  <thead>
                    <tr>
                      <th>Variante</th>
                      <th>SKU</th>
                      <th>Stock actual</th>
                      <th>Ingresar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {persistedVariants.map((variant) => {
                      const currentStock = loadStoreId ? (stockByVariantStore[`${variant.id}-${loadStoreId}`] || 0) : 0;
                      return (
                        <tr key={variant.id}>
                          <td data-label="Variante">{variantLabel(variant)}</td>
                          <td data-label="SKU" className="admin-variants-sku-next">{variant.sku || '—'}</td>
                          <td data-label="Stock actual">{currentStock}</td>
                          <td data-label="Ingresar">
                            <input
                              type="number"
                              min="0"
                              value={loadQty[variant.id as number] || 0}
                              onChange={(event) => {
                                const qty = Math.max(0, Number(event.target.value) || 0);
                                setLoadQty((current) => ({ ...current, [variant.id as number]: qty }));
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="admin-variants-stockload-foot-next">
                <span className="admin-chip-count">{pendingStockUnits} und. a ingresar</span>
                <button type="button" className="admin-primary-btn" onClick={registerInitialStock} disabled={isLoadingStock || pendingStockUnits <= 0}>
                  {isLoadingStock ? 'Registrando...' : 'Registrar ingresos'}
                </button>
              </div>
            </>
          )}
        </div>
      </details>
    </article>
  );
}
