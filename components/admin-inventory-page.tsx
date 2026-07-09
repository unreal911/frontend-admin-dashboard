'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AdminSelect, AdminSelectOption } from '@/components/admin-select';
import { BarcodeScanButton } from '@/components/barcode-scan-button';
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

const INVENTORY_STOCK_SCOPE_OPTIONS: AdminSelectOption<InventoryStockScope>[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'OUT', label: 'Sin stock' },
  { value: 'CRITICAL', label: 'Critico (1-3)' },
  { value: 'LOW', label: 'Bajo (4-10)' },
  { value: 'NORMAL', label: 'Normal' },
];

const INVENTORY_MOVEMENT_TYPE_OPTIONS: AdminSelectOption<InventoryMovementType>[] = [
  { value: 'IN', label: 'Ingreso' },
  { value: 'OUT', label: 'Salida' },
  { value: 'ADJUSTMENT', label: 'Ajuste' },
];

function toInventoryStockScope(value: string | null): InventoryStockScope {
  const normalized = String(value || '').trim().toUpperCase().replace('-', '_');
  if (normalized === 'OUT') return 'OUT';
  if (normalized === 'CRITICAL') return 'CRITICAL';
  if (normalized === 'LOW') return 'LOW';
  if (normalized === 'NORMAL') return 'NORMAL';
  if (normalized === 'CRITICAL_TOTAL') return 'ALL';
  return 'ALL';
}

// Saltos de cantidad frecuentes en mayorista (media docena, docena, 2 docenas).
const QUICK_QTY_PRESETS = [6, 12, 24];

function getAvailabilityClass(available: number): string {
  if (available <= 0) return 'is-out';
  if (available <= 10) return 'is-low';
  return 'is-ok';
}

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

function normalizeInventoryAttribute(value?: string | null): string {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.startsWith('__SIN_')) {
    return '';
  }
  return normalized;
}

function getInventoryVariantDisplay(item: Inventory): string {
  const sizeName = normalizeInventoryAttribute(item.variant.size?.name);
  const colorName = normalizeInventoryAttribute(item.variant.color?.name);
  const parts = [colorName, sizeName].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Unico';
}

interface InventoryQuickMoveProps {
  item: Inventory;
  qty: number;
  busy: boolean;
  reconciling: boolean;
  hasMismatch: boolean;
  lastAction?: string;
  onQtyChange: (value: number) => void;
  onMove: (type: 'IN' | 'OUT') => void;
  onAdjust: () => void;
  onNav: (path: string) => void;
  onReconcile: () => void;
}

/**
 * Acciones rapidas de una fila en movil: stepper de cantidad + Ingreso/Salida
 * directos (sin drawer) para registrar movimientos de un toque. El resto
 * (ajuste, movimientos, trazabilidad, reconciliar) queda en el menu "Mas".
 */
function InventoryQuickMove({
  item,
  qty,
  busy,
  reconciling,
  hasMismatch,
  lastAction,
  onQtyChange,
  onMove,
  onAdjust,
  onNav,
  onReconcile,
}: InventoryQuickMoveProps) {
  return (
    <div className="inventory-quick-move-next">
      <div className="inventory-quick-move-top-next">
        <div className="inventory-qty-stepper-next">
          <button
            type="button"
            aria-label="Menos"
            disabled={busy || qty <= 1}
            onClick={() => onQtyChange(qty - 1)}
          >
            −
          </button>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={qty}
            aria-label="Cantidad"
            onChange={(event) => onQtyChange(Math.max(1, Number(event.target.value) || 1))}
          />
          <button
            type="button"
            aria-label="Mas"
            disabled={busy}
            onClick={() => onQtyChange(qty + 1)}
          >
            +
          </button>
        </div>
        <details className="inventory-actions-menu-next inventory-more-next">
          <summary className="inventory-actions-trigger-next" aria-label="Mas acciones">
            Mas
          </summary>
          <div className="inventory-actions-list-next">
            <button type="button" onClick={onAdjust}>Ajuste manual</button>
            <button type="button" onClick={() => onNav(`/admin/inventory/movements?inventoryId=${item.id}`)}>
              Ver movimientos
            </button>
            <button type="button" onClick={() => onNav(`/admin/inventory/traceability?inventoryId=${item.id}`)}>
              Ver trazabilidad
            </button>
            {hasMismatch ? (
              <button type="button" disabled={reconciling} onClick={onReconcile}>
                Reconciliar reservado
              </button>
            ) : null}
          </div>
        </details>
      </div>
      <div className="inventory-qty-presets-next">
        {QUICK_QTY_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset}
            className={`inventory-qty-preset-next${qty === preset ? ' is-active' : ''}`}
            disabled={busy}
            onClick={() => onQtyChange(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
      <div className="inventory-quick-move-btns-next">
        <button
          type="button"
          className="inventory-move-btn-next income"
          disabled={busy}
          onClick={() => onMove('IN')}
        >
          {busy ? '…' : `Ingreso +${qty}`}
        </button>
        <button
          type="button"
          className="inventory-move-btn-next outcome"
          disabled={busy}
          onClick={() => onMove('OUT')}
        >
          {busy ? '…' : `Salida −${qty}`}
        </button>
      </div>
      {lastAction ? (
        <p className="inventory-last-action-next">Última: {lastAction}</p>
      ) : null}
    </div>
  );
}

export function AdminInventoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm, showAlert } = useAdminUi();

  const [inventoryData, setInventoryData] = useState<Inventory[]>([]);
  const [reservationsData, setReservationsData] = useState<InventoryReservation[]>([]);
  const [productCatalog, setProductCatalog] = useState<ProductForInventoryCatalog[]>([]);
  const [storeOptions, setStoreOptions] = useState<InventoryStore[]>([]);

  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
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

  const [quickQty, setQuickQty] = useState<Record<number, number>>({});
  const [quickBusyId, setQuickBusyId] = useState<number | null>(null);
  const [lastQuickAction, setLastQuickAction] = useState<Record<number, string>>({});
  const [focusedInventoryId, setFocusedInventoryId] = useState<number | null>(null);

  const [movementDrawerOpen, setMovementDrawerOpen] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState<Inventory | null>(null);
  const [movementStoreId, setMovementStoreId] = useState<number | null>(null);
  const [movementVariantId, setMovementVariantId] = useState<number | null>(null);
  const [movementVariantSearch, setMovementVariantSearch] = useState('');
  const [movementQuantity, setMovementQuantity] = useState(0);
  const [movementType, setMovementType] = useState<InventoryMovementType>('IN');
  const [adjustmentCount, setAdjustmentCount] = useState(0);
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

  const inventoryMetrics = useMemo(() => {
    return filteredInventories.reduce((acc, item) => {
      const available = computeAvailableStock(item);
      acc.available += available;
      acc.reserved += Number(item.reservedStock || 0);
      if (available <= 0) acc.out += 1;
      if (available > 0 && available <= 10) acc.low += 1;
      return acc;
    }, {
      available: 0,
      reserved: 0,
      out: 0,
      low: 0,
    });
  }, [filteredInventories]);

  // Ajuste por conteo real: el usuario fija el stock contado y calculamos el
  // delta. Solo aplica cuando hay una fila seleccionada (conocemos stock actual).
  const isCountAdjustment = movementType === 'ADJUSTMENT' && selectedInventory !== null;
  const adjustmentDelta = adjustmentCount - Number(selectedInventory?.stock ?? 0);

  const canSaveMovement = Boolean(
    movementStoreId
      && movementVariantId
      && !creatingMovement
      && (isCountAdjustment ? adjustmentDelta !== 0 : movementQuantity > 0),
  );

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
    const normalizedScopeParam = searchParams.get('stockScope')?.toUpperCase().replace('-', '_');
    const nextScope = toInventoryStockScope(searchParams.get('stockScope'));
    setStockScope(nextScope);
    setShowAdvancedFilters(searchParams.get('showAdvanced') === '1' || nextScope !== 'ALL');
    if (normalizedScopeParam === 'CRITICAL_TOTAL') {
      setLowStockThreshold(3);
      setIncludeZero(true);
    } else {
      setLowStockThreshold(0);
    }
  }, [searchParams]);

  useEffect(() => {
    loadReservations();
    loadStores();
    loadProductCatalog();
  }, []);

  // Tras un escaneo con match unico: scroll a la fila y quita el resaltado.
  useEffect(() => {
    if (focusedInventoryId === null) {
      return;
    }
    const row = document.getElementById(`inv-row-${focusedInventoryId}`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => setFocusedInventoryId(null), 3200);
    return () => clearTimeout(timer);
  }, [focusedInventoryId]);

  function openMovementDrawer(item: Inventory, type: InventoryMovementType) {
    setSelectedInventory(item);
    setMovementStoreId(item.store.id);
    setMovementVariantId(item.variant.id);
    setMovementVariantSearch('');
    setMovementType(type);
    setMovementQuantity(0);
    setAdjustmentCount(Number(item.stock || 0));
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
          quantity: isCountAdjustment ? adjustmentDelta : movementQuantity,
          type: movementType,
          note: movementNote.trim()
            || (isCountAdjustment ? `Ajuste por conteo real a ${adjustmentCount}` : undefined),
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

  async function postQuickMovement(item: Inventory, type: 'IN' | 'OUT', quantity: number): Promise<boolean> {
    const response = await fetch('/api/admin/inventory/movements', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        storeId: item.store.id,
        variantId: item.variant.id,
        quantity,
        type,
        note: type === 'IN' ? 'Ingreso rapido' : 'Salida rapida',
      }),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;
    if (!response || !response.ok) {
      showAlert(String((payload as { message?: unknown } | null)?.message || 'Error al registrar movimiento.'), 'error');
      return false;
    }
    return true;
  }

  // Patch local del stock: evita recargar los ~300 items tras cada movimiento.
  // Los movimientos IN/OUT solo afectan stock (no reservas), asi que basta con
  // ajustar stock/availableStock de la fila tocada.
  function applyStockDelta(inventoryId: number, delta: number) {
    setInventoryData((prev) => prev.map((row) => {
      if (row.id !== inventoryId) {
        return row;
      }
      const stock = Math.max(0, Number(row.stock || 0) + delta);
      const reserved = Number(row.reservedStock || 0);
      return { ...row, stock, availableStock: stock - reserved };
    }));
  }

  async function submitQuickMovement(item: Inventory, type: 'IN' | 'OUT') {
    if (quickBusyId !== null) {
      return;
    }
    const quantity = Math.max(1, quickQty[item.id] || 1);

    // Control: avisar si la Salida deja el stock negativo o toca lo reservado.
    if (type === 'OUT') {
      const stock = Number(item.stock || 0);
      const reserved = Number(item.reservedStock || 0);
      const resultStock = stock - quantity;
      if (resultStock < 0) {
        const proceed = await confirm({
          title: 'Stock insuficiente',
          message: `La salida de ${quantity} deja el stock en ${resultStock} (hay ${stock}). ¿Registrar de todas formas?`,
          acceptText: 'Registrar',
          cancelText: 'Cancelar',
        });
        if (!proceed) {
          return;
        }
      } else if (resultStock < reserved) {
        const proceed = await confirm({
          title: 'Toca stock reservado',
          message: `Quedarian ${resultStock} y hay ${reserved} reservada(s) para pedidos. La salida invade el stock reservado. ¿Continuar?`,
          acceptText: 'Continuar',
          cancelText: 'Cancelar',
        });
        if (!proceed) {
          return;
        }
      }
    }

    setQuickBusyId(item.id);
    try {
      const ok = await postQuickMovement(item, type, quantity);
      if (!ok) {
        return;
      }
      const delta = type === 'IN' ? quantity : -quantity;
      applyStockDelta(item.id, delta);
      const verb = type === 'IN' ? 'Ingreso' : 'Salida';
      const inverse: 'IN' | 'OUT' = type === 'IN' ? 'OUT' : 'IN';
      setLastQuickAction((prev) => ({
        ...prev,
        [item.id]: `${verb} ${type === 'IN' ? '+' : '−'}${quantity}`,
      }));
      showAlert(
        `${verb} de ${quantity} en ${item.store.name}.`,
        'success',
        5000,
        {
          label: 'Deshacer',
          onClick: () => {
            void (async () => {
              const undone = await postQuickMovement(item, inverse, quantity);
              if (undone) {
                applyStockDelta(item.id, -delta);
                setLastQuickAction((prev) => {
                  const next = { ...prev };
                  delete next[item.id];
                  return next;
                });
                showAlert('Movimiento revertido.', 'info');
              }
            })();
          },
        },
      );
    } finally {
      setQuickBusyId(null);
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

  function handleScan(code: string) {
    const value = String(code || '').trim();
    if (!value) {
      return;
    }
    setSearchParam(value);
    const needle = value.toLowerCase();
    const matches = inventoryData.filter((item) => (
      item.variant.sku.toLowerCase().includes(needle)
      || item.variant.product.name.toLowerCase().includes(needle)
      || item.store.name.toLowerCase().includes(needle)
      || item.variant.size.name.toLowerCase().includes(needle)
      || item.variant.color.name.toLowerCase().includes(needle)
    ));

    if (matches.length === 1) {
      // Match unico: enfoca la fila (scroll + resaltado) lista para operar.
      setFocusedInventoryId(matches[0].id);
      showAlert(`1 resultado: ${matches[0].variant.product.name}`, 'success', 2600);
    } else if (matches.length === 0) {
      showAlert(`Sin resultados para: ${value}`, 'warning', 2600);
    } else {
      showAlert(`${matches.length} resultados para: ${value}`, 'info', 2200);
    }
  }

  return (
    <section className="admin-dashboard-grid">
      <div className="inventory-mobile-toolbar-next">
        <input
          type="text"
          className="inventory-mobile-search-next"
          value={searchParam}
          onChange={(event) => setSearchParam(event.target.value)}
          placeholder="SKU, producto, tienda…"
          aria-label="Buscar inventario"
        />
        {searchParam ? (
          <button
            type="button"
            className="inventory-mobile-clear-next"
            aria-label="Limpiar busqueda"
            onClick={() => setSearchParam('')}
          >
            ×
          </button>
        ) : null}
        <BarcodeScanButton onScan={handleScan} className="inventory-mobile-tool-btn-next" label="Escanear" />
        <button
          type="button"
          className="inventory-mobile-tool-btn-next primary"
          onClick={() => openManualMovementDrawer('IN')}
        >
          + Nuevo
        </button>
        <button
          type="button"
          className="inventory-mobile-tool-btn-next"
          onClick={() => setShowAdvancedFilters((value) => !value)}
        >
          Filtros
        </button>
      </div>

      <article className="admin-card inventory-header-card">
        <div className="inventory-header-copy-next">
          <p className="section-kicker">Administracion de inventario</p>
          <h1 className="section-title">Inventario</h1>
          <p className="admin-muted-text">Controla stock, reservas y movimientos por tienda.</p>
          <div className="inventory-metric-strip-next">
            <span><strong>{filteredInventories.length}</strong> items</span>
            <span><strong>{inventoryMetrics.available}</strong> disp.</span>
            <span><strong>{inventoryMetrics.reserved}</strong> reserv.</span>
            <span><strong>{inventoryMetrics.low}</strong> bajo stock</span>
          </div>
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

      <article className={`admin-card admin-filters-card-next inventory-filters-card${showAdvancedFilters ? ' is-open' : ''}`}>
        <fieldset className="admin-filters-fieldset-next">
          <legend className="admin-filters-legend-next">Filtros</legend>
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

              <div className="inventory-field">
                <span>Tienda</span>
                <AdminSelect
                  value={String(selectedStoreId || '')}
                  options={[
                    { value: '', label: 'Todas las tiendas' },
                    ...storeOptions.map((store) => ({ value: String(store.id), label: `${store.name} (${store.code})` })),
                  ]}
                  ariaLabel="Filtrar inventario por tienda"
                  onChange={(nextValue) => setSelectedStoreId(toPositiveInt(nextValue))}
                />
              </div>

              <div className="inventory-field">
                <span>Producto</span>
                <AdminSelect
                  value={String(selectedProductId || '')}
                  options={[
                    { value: '', label: 'Todos' },
                    ...productOptions.map((product) => ({ value: String(product.id), label: product.name })),
                  ]}
                  ariaLabel="Filtrar inventario por producto"
                  onChange={(nextValue) => setSelectedProductId(toPositiveInt(nextValue))}
                />
              </div>

              <div className="inventory-field">
                <span>Talla</span>
                <AdminSelect
                  value={String(selectedSizeId || '')}
                  options={[
                    { value: '', label: 'Todas' },
                    ...sizeOptions.map((size) => ({ value: String(size.id), label: size.name })),
                  ]}
                  ariaLabel="Filtrar inventario por talla"
                  onChange={(nextValue) => setSelectedSizeId(toPositiveInt(nextValue))}
                />
              </div>

              <div className="inventory-field">
                <span>Color</span>
                <AdminSelect
                  value={String(selectedColorId || '')}
                  options={[
                    { value: '', label: 'Todos' },
                    ...colorOptions.map((color) => ({ value: String(color.id), label: color.name })),
                  ]}
                  ariaLabel="Filtrar inventario por color"
                  onChange={(nextValue) => setSelectedColorId(toPositiveInt(nextValue))}
                />
              </div>

              <div className="inventory-field">
                <span>Estado de stock</span>
                <AdminSelect
                  value={stockScope}
                  options={INVENTORY_STOCK_SCOPE_OPTIONS}
                  ariaLabel="Filtrar inventario por estado de stock"
                  onChange={setStockScope}
                />
              </div>

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
        <div className="admin-table-wrap inventory-table-wrap-next">
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
                  <tr
                    key={item.id}
                    id={`inv-row-${item.id}`}
                    className={focusedInventoryId === item.id ? 'inventory-row-scan-focus-next' : undefined}
                  >
                    <td data-label="#">{index + 1}</td>
                    <td data-label="Producto">
                      <div className="inventory-mobile-product-next">
                        <strong>{item.variant.product.name}</strong>
                        <small>{getInventoryVariantDisplay(item)}</small>
                      </div>
                    </td>
                    <td data-label="SKU" className="inventory-sku-cell-next">{item.variant.sku}</td>
                    <td data-label="Tienda">{item.store.name}</td>
                    <td data-label="Disponible">
                      <span className={`inventory-avail-next ${getAvailabilityClass(computeAvailableStock(item))}`}>
                        {computeAvailableStock(item)}
                      </span>
                    </td>
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
                      <div className="inventory-row-actions-next">
                        <button
                          type="button"
                          className="inventory-action-pill-next income"
                          title="Registrar ingreso"
                          aria-label="Registrar ingreso"
                          onClick={() => openMovementDrawer(item, 'IN')}
                        >
                          I
                        </button>
                        <button
                          type="button"
                          className="inventory-action-pill-next outcome"
                          title="Registrar salida"
                          aria-label="Registrar salida"
                          onClick={() => openMovementDrawer(item, 'OUT')}
                        >
                          S
                        </button>
                        <button
                          type="button"
                          className="inventory-action-pill-next adjustment"
                          title="Registrar ajuste"
                          aria-label="Registrar ajuste"
                          onClick={() => openMovementDrawer(item, 'ADJUSTMENT')}
                        >
                          A
                        </button>
                        <button
                          type="button"
                          className="inventory-action-pill-next mobile-extra movements"
                          title="Ver movimientos"
                          aria-label="Ver movimientos"
                          onClick={() => router.push(`/admin/inventory/movements?inventoryId=${item.id}`)}
                        >
                          M
                        </button>
                        <button
                          type="button"
                          className="inventory-action-pill-next mobile-extra traceability"
                          title="Ver trazabilidad"
                          aria-label="Ver trazabilidad"
                          onClick={() => router.push(`/admin/inventory/traceability?inventoryId=${item.id}`)}
                        >
                          T
                        </button>
                        <details className="inventory-actions-menu-next">
                          <summary className="inventory-actions-trigger-next" aria-label="Abrir mas acciones">
                            Mas
                          </summary>
                          <div className="inventory-actions-list-next">
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
                      </div>
                      <InventoryQuickMove
                        item={item}
                        qty={Math.max(1, quickQty[item.id] || 1)}
                        busy={quickBusyId === item.id}
                        reconciling={reconcilingReserved}
                        hasMismatch={hasReservedMismatch(item)}
                        lastAction={lastQuickAction[item.id]}
                        onQtyChange={(value) => setQuickQty((prev) => ({ ...prev, [item.id]: value }))}
                        onMove={(type) => submitQuickMovement(item, type)}
                        onAdjust={() => openMovementDrawer(item, 'ADJUSTMENT')}
                        onNav={(path) => router.push(path)}
                        onReconcile={() => reconcileReservedStock(item)}
                      />
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

            <div className="inventory-drawer-body">
              {movementErrorMessage ? (
                <div className="admin-feedback error inventory-drawer-feedback" role="alert">
                  {movementErrorMessage}
                </div>
              ) : null}

              <div className="inventory-field">
                <span>Tipo de movimiento</span>
                <AdminSelect
                  value={movementType}
                  options={INVENTORY_MOVEMENT_TYPE_OPTIONS}
                  ariaLabel="Seleccionar tipo de movimiento"
                  onChange={(nextType) => {
                    setMovementType(nextType as InventoryMovementType);
                    if (nextType === 'ADJUSTMENT' && selectedInventory) {
                      setAdjustmentCount(Number(selectedInventory.stock || 0));
                    }
                  }}
                />
              </div>

              <div className="inventory-field">
                <span>Tienda destino</span>
                <AdminSelect
                  value={String(movementStoreId || '')}
                  options={[
                    { value: '', label: 'Selecciona una tienda' },
                    ...storeOptions.map((store) => ({ value: String(store.id), label: `${store.name} (${store.code})` })),
                  ]}
                  ariaLabel="Seleccionar tienda destino"
                  onChange={(nextValue) => setMovementStoreId(toPositiveInt(nextValue))}
                />
              </div>

              <label className="inventory-field">
                <span>Buscar variante</span>
                <input
                  type="text"
                  value={movementVariantSearch}
                  onChange={(event) => setMovementVariantSearch(event.target.value)}
                  placeholder="SKU, producto, color o talla"
                />
              </label>

              <div className="inventory-field">
                <span>Variante</span>
                <AdminSelect
                  value={String(movementVariantId || '')}
                  options={[
                    { value: '', label: 'Selecciona una variante' },
                    ...filteredVariantCatalog.map((variant) => ({ value: String(variant.variantId), label: variant.productName })),
                  ]}
                  ariaLabel="Seleccionar variante"
                  onChange={(nextValue) => setMovementVariantId(toPositiveInt(nextValue))}
                />
              </div>

              {selectedMovementVariant ? (
                <div className="inventory-summary-card">
                  <p className="inventory-quick-title">Variante seleccionada</p>
                  <p>{selectedMovementVariant.productName}</p>
                  <p className="admin-muted-text">
                    {selectedMovementVariant.colorName} / {selectedMovementVariant.sizeName} - {selectedMovementVariant.sku}
                  </p>
                </div>
              ) : null}

              {isCountAdjustment ? (
                <>
                  <label className="inventory-field">
                    <span>Conteo real (stock contado)</span>
                    <input
                      type="number"
                      min={0}
                      value={adjustmentCount}
                      onChange={(event) => setAdjustmentCount(Math.max(0, Number(event.target.value) || 0))}
                    />
                  </label>
                  <div className="inventory-adjust-delta-next">
                    Stock actual: {Number(selectedInventory?.stock ?? 0)}
                    {' → '}
                    ajuste{' '}
                    <strong className={adjustmentDelta === 0 ? '' : adjustmentDelta > 0 ? 'is-pos' : 'is-neg'}>
                      {adjustmentDelta > 0 ? `+${adjustmentDelta}` : adjustmentDelta}
                    </strong>
                  </div>
                </>
              ) : (
                <label className="inventory-field">
                  <span>Cantidad</span>
                  <input
                    type="number"
                    min={1}
                    value={movementQuantity}
                    onChange={(event) => setMovementQuantity(Math.max(0, Number(event.target.value) || 0))}
                  />
                </label>
              )}

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

