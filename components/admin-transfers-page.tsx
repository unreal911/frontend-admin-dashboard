'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminSelect, AdminSelectOption } from '@/components/admin-select';
import { useAdminUi } from '@/components/admin-ui-provider';
import { AdminTableEmptyState } from '@/components/admin-table-empty-state';
import {
  Inventory,
  InventoryStore,
  ProductForInventoryCatalog,
  StockTransfer,
  StockTransferStatus,
  normalizeInventoryList,
  normalizeProductsForInventoryCatalog,
  normalizeTransfers,
} from '@/lib/admin-inventory-types';

interface TransferVariantOption {
  productId: number;
  variantId: number;
  sku: string;
  productName: string;
  colorName: string;
  sizeName: string;
  isUnique: boolean;
  description: string;
  searchText: string;
}

interface TransferProductOption {
  productId: number;
  productName: string;
  hasColor: boolean;
  hasSize: boolean;
  variants: TransferVariantOption[];
  totalAvailable: number;
  searchText: string;
}

interface TransferDraftItem {
  rowId: number;
  variantId: number | null;
  quantity: number;
}

type TransferStatusFilter = 'ALL' | 'TO_RECEIVE' | StockTransferStatus;

const ALLOWED_STATUS_FILTERS: TransferStatusFilter[] = [
  'ALL',
  'TO_RECEIVE',
  'PENDING',
  'IN_TRANSIT',
  'RECEIVED',
  'CANCELLED',
];

const TRANSFER_STATUS_OPTIONS: AdminSelectOption<TransferStatusFilter>[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'TO_RECEIVE', label: 'Pendientes de recepcion' },
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'IN_TRANSIT', label: 'En transito' },
  { value: 'RECEIVED', label: 'Recibida' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

function toPositiveInt(value: string): number | null {
  const parsed = Number(value || 0);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function toStatusFilter(value: string | null | undefined): TransferStatusFilter {
  const normalized = String(value || '').trim().toUpperCase() as TransferStatusFilter;
  return ALLOWED_STATUS_FILTERS.includes(normalized) ? normalized : 'ALL';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function matchesStatusFilter(status: StockTransferStatus, filter: TransferStatusFilter): boolean {
  if (filter === 'ALL') {
    return true;
  }
  if (filter === 'TO_RECEIVE') {
    return status === 'PENDING' || status === 'IN_TRANSIT';
  }
  return status === filter;
}

function getStatusLabel(status: StockTransferStatus): string {
  const labels: Record<StockTransferStatus, string> = {
    PENDING: 'Pendiente',
    IN_TRANSIT: 'En transito',
    RECEIVED: 'Recibida',
    CANCELLED: 'Cancelada',
  };
  return labels[status] || status;
}

function getStatusClass(status: StockTransferStatus): string {
  switch (status) {
    case 'PENDING':
      return 'warning';
    case 'IN_TRANSIT':
      return 'info';
    case 'RECEIVED':
      return 'success';
    case 'CANCELLED':
      return 'error';
    default:
      return 'info';
  }
}

function normalizeStoreOptions(payload: unknown): InventoryStore[] {
  const raw = Array.isArray(payload)
    ? payload
    : (Array.isArray((payload as { data?: unknown[] } | null)?.data) ? (payload as { data: unknown[] }).data : []);

  const options: InventoryStore[] = [];
  for (const item of raw) {
    const row = item as Partial<InventoryStore>;
    const id = Number(row.id);
    const name = String(row.name || '').trim();
    const code = String(row.code || '').trim();
    if (!Number.isInteger(id) || id < 1 || !name || !code) {
      continue;
    }
    options.push({
      id,
      name,
      code,
      type: String(row.type || '').trim() || undefined,
      isActive: row.isActive !== false,
    });
  }
  return options;
}

function getUserFullName(user?: { firstName: string; lastName: string } | null): string {
  if (!user) {
    return '-';
  }
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return fullName || '-';
}

function normalizeVariantSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function AdminTransfersPage() {
  const searchParams = useSearchParams();
  const { showAlert } = useAdminUi();

  const originAvailabilityCacheRef = useRef<Map<number, Record<number, number>>>(new Map());
  const nextDraftRowIdRef = useRef(1);

  const [transfersData, setTransfersData] = useState<StockTransfer[]>([]);
  const [storeOptions, setStoreOptions] = useState<InventoryStore[]>([]);
  const [productCatalog, setProductCatalog] = useState<ProductForInventoryCatalog[]>([]);

  const [searchParam, setSearchParam] = useState('');
  const [statusFilter, setStatusFilter] = useState<TransferStatusFilter>('ALL');

  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [showTransferDetails, setShowTransferDetails] = useState(false);
  const [selectedTransferDetails, setSelectedTransferDetails] = useState<StockTransfer | null>(null);
  const [creatingTransfer, setCreatingTransfer] = useState(false);
  const [receivingTransferIds, setReceivingTransferIds] = useState<number[]>([]);
  const [dispatchingTransferIds, setDispatchingTransferIds] = useState<number[]>([]);

  const [fromStoreId, setFromStoreId] = useState<number | null>(null);
  const [toStoreId, setToStoreId] = useState<number | null>(null);
  const [transferNote, setTransferNote] = useState('');
  const [variantSearch, setVariantSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [variantAxis, setVariantAxis] = useState<'color' | 'size'>('color');
  const [activeVariantFilter, setActiveVariantFilter] = useState('');
  const [draftItems, setDraftItems] = useState<TransferDraftItem[]>([]);

  const [loadingOriginInventory, setLoadingOriginInventory] = useState(false);
  const [originVariantStockById, setOriginVariantStockById] = useState<Record<number, number>>({});

  const variantCatalog = useMemo<TransferVariantOption[]>(() => {
    const options: TransferVariantOption[] = [];
    productCatalog.forEach((product) => {
      (product.variants || []).forEach((variant) => {
        if (variant.isActive === false) {
          return;
        }
        const colorName = product.hasColor ? (variant.color?.name || 'Sin color') : '';
        const sizeName = product.hasSize ? (variant.size?.name || 'Sin talla') : '';
        const sku = variant.sku || `VAR-${variant.id}`;
        const isUnique = !product.hasColor && !product.hasSize;
        const attributes = [
          product.hasColor ? `Color: ${colorName}` : '',
          product.hasSize ? `Talla: ${sizeName}` : '',
        ].filter(Boolean);
        const description = `${isUnique ? 'Variante única' : attributes.join(' · ')} · SKU: ${sku}`;
        options.push({
          productId: product.id,
          variantId: variant.id,
          sku,
          productName: product.name,
          colorName,
          sizeName,
          isUnique,
          description,
          searchText: normalizeVariantSearch([
            product.name,
            colorName,
            sizeName,
            sku,
            isUnique ? 'unico unica variante unica' : '',
          ].join(' ')),
        });
      });
    });
    return options.sort((a, b) => (
      a.productName.localeCompare(b.productName)
      || a.description.localeCompare(b.description)
    ));
  }, [productCatalog]);

  const availableProductCatalog = useMemo<TransferProductOption[]>(() => productCatalog
    .map((product) => {
      const variants = variantCatalog.filter((variant) => (
        variant.productId === product.id && (originVariantStockById[variant.variantId] || 0) > 0
      ));
      return {
        productId: product.id,
        productName: product.name,
        hasColor: product.hasColor,
        hasSize: product.hasSize,
        variants,
        totalAvailable: variants.reduce(
          (total, variant) => total + (originVariantStockById[variant.variantId] || 0),
          0,
        ),
        searchText: normalizeVariantSearch([
          product.name,
          ...variants.map((variant) => variant.searchText),
        ].join(' ')),
      };
    })
    .filter((product) => product.variants.length > 0)
    .sort((a, b) => a.productName.localeCompare(b.productName)), [originVariantStockById, productCatalog, variantCatalog]);

  const productSearchResults = useMemo(() => {
    if (!fromStoreId || !toStoreId || fromStoreId === toStoreId || loadingOriginInventory) {
      return [] as TransferProductOption[];
    }
    const terms = normalizeVariantSearch(variantSearch).split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      return [] as TransferProductOption[];
    }
    return availableProductCatalog
      .filter((product) => terms.every((term) => product.searchText.includes(term)))
      .slice(0, 8);
  }, [availableProductCatalog, fromStoreId, loadingOriginInventory, toStoreId, variantSearch]);

  const selectedProduct = useMemo(() => (
    availableProductCatalog.find((product) => product.productId === selectedProductId) || null
  ), [availableProductCatalog, selectedProductId]);

  const selectedVariantIds = useMemo(() => new Set(
    draftItems.flatMap((item) => (item.variantId ? [item.variantId] : [])),
  ), [draftItems]);

  const selectedUnitCount = useMemo(() => draftItems.reduce((total, item) => total + (item.quantity || 0), 0), [draftItems]);

  const selectedProductGroups = useMemo(() => {
    const groups = new Map<number, {
      productName: string;
      entries: Array<{ item: TransferDraftItem; variant: TransferVariantOption }>;
    }>();
    draftItems.forEach((item) => {
      const variant = variantCatalog.find((entry) => entry.variantId === item.variantId);
      if (!variant) return;
      const group = groups.get(variant.productId) || { productName: variant.productName, entries: [] };
      group.entries.push({ item, variant });
      groups.set(variant.productId, group);
    });
    return Array.from(groups.entries()).map(([productId, group]) => ({ productId, ...group }));
  }, [draftItems, variantCatalog]);

  const filteredTransfers = useMemo(() => {
    const query = searchParam.trim().toLowerCase();
    return transfersData.filter((transfer) => {
      if (!matchesStatusFilter(transfer.status, statusFilter)) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        transfer.code,
        transfer.fromStore?.name,
        transfer.fromStore?.code,
        transfer.toStore?.name,
        transfer.toStore?.code,
        transfer.note || '',
        transfer.createdBy ? `${transfer.createdBy.firstName} ${transfer.createdBy.lastName || ''}` : '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [searchParam, statusFilter, transfersData]);

  const canCreateTransfer = useMemo(() => {
    if (creatingTransfer) {
      return false;
    }
    if (!fromStoreId || !toStoreId || fromStoreId === toStoreId) {
      return false;
    }
    const validItems = draftItems.filter((item) => Number.isInteger(item.variantId) && (item.quantity || 0) > 0);
    return validItems.length > 0 && validItems.every((item) => (
      item.variantId != null && item.quantity <= (originVariantStockById[item.variantId] || 0)
    ));
  }, [creatingTransfer, draftItems, fromStoreId, originVariantStockById, toStoreId]);

  const loadTransfers = useCallback(async () => {
    const response = await fetch('/api/admin/inventory/transfers', {
      method: 'GET',
      cache: 'no-store',
    }).catch(() => null);

    if (!response) {
      setTransfersData([]);
      showAlert('Error al cargar transferencias.', 'error');
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setTransfersData([]);
      showAlert(String((payload as { message?: unknown } | null)?.message || 'Error al cargar transferencias.'), 'error');
      return;
    }

    setTransfersData(normalizeTransfers(payload));
  }, [showAlert]);

  const loadStores = useCallback(async () => {
    const response = await fetch('/api/admin/stores?skip=1&take=200', {
      method: 'GET',
      cache: 'no-store',
    }).catch(() => null);

    if (!response) {
      setStoreOptions([]);
      return;
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setStoreOptions([]);
      return;
    }
    setStoreOptions(normalizeStoreOptions(payload));
  }, []);

  const loadProducts = useCallback(async () => {
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
  }, []);

  const clearUnavailableDraftVariants = useCallback((availability: Record<number, number>) => {
    let removedSelections = 0;

    setDraftItems((current) => current.filter((item) => {
      const variantId = Number(item.variantId || 0);
      if (!variantId) {
        return false;
      }

      if ((availability[variantId] || 0) <= 0) {
        removedSelections += 1;
        return false;
      }
      return true;
    }));

    if (removedSelections > 0) {
      showAlert(
        'Se limpiaron variantes sin stock disponible en la tienda de origen seleccionada.',
        'warning',
        3200,
      );
    }
  }, [showAlert]);

  const loadOriginVariantsForStore = useCallback(async (storeId: number | null) => {
    if (!storeId) {
      setLoadingOriginInventory(false);
      setOriginVariantStockById({});
      clearUnavailableDraftVariants({});
      return;
    }

    const cachedAvailability = originAvailabilityCacheRef.current.get(storeId);
    if (cachedAvailability) {
      setLoadingOriginInventory(false);
      setOriginVariantStockById(cachedAvailability);
      clearUnavailableDraftVariants(cachedAvailability);
      return;
    }

    setLoadingOriginInventory(true);
    const response = await fetch(`/api/admin/inventory?skip=1&take=1000&storeId=${storeId}&includeZero=false`, {
      method: 'GET',
      cache: 'no-store',
    }).catch(() => null);

    if (!response) {
      setLoadingOriginInventory(false);
      setOriginVariantStockById({});
      clearUnavailableDraftVariants({});
      showAlert('Error al cargar inventario de tienda origen.', 'error');
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setLoadingOriginInventory(false);
      setOriginVariantStockById({});
      clearUnavailableDraftVariants({});
      showAlert(String((payload as { message?: unknown } | null)?.message || 'Error al cargar inventario de tienda origen.'), 'error');
      return;
    }

    const inventories = normalizeInventoryList(payload);
    const availability: Record<number, number> = {};
    inventories.forEach((inventory: Inventory) => {
      const variantId = Number(inventory.variant.id || 0);
      if (!variantId) {
        return;
      }
      const available = Number(
        inventory.availableStock ?? (Number(inventory.stock || 0) - Number(inventory.reservedStock || 0)),
      );
      if (Number.isFinite(available) && available > 0) {
        availability[variantId] = Math.floor(available);
      }
    });

    originAvailabilityCacheRef.current.set(storeId, availability);
    setOriginVariantStockById(availability);
    clearUnavailableDraftVariants(availability);
    setLoadingOriginInventory(false);
  }, [clearUnavailableDraftVariants, showAlert]);

  useEffect(() => {
    setStatusFilter(toStatusFilter(searchParams.get('status')));
    setSearchParam(String(searchParams.get('search') || '').trim());
  }, [searchParams]);

  useEffect(() => {
    loadTransfers();
    loadStores();
    loadProducts();
  }, [loadProducts, loadStores, loadTransfers]);

  useEffect(() => {
    loadOriginVariantsForStore(fromStoreId);
  }, [fromStoreId, loadOriginVariantsForStore]);

  function resetCreateForm() {
    setFromStoreId(null);
    setToStoreId(null);
    setTransferNote('');
    setVariantSearch('');
    setSelectedProductId(null);
    setVariantAxis('color');
    setActiveVariantFilter('');
    setDraftItems([]);
    setOriginVariantStockById({});
    setLoadingOriginInventory(false);
    nextDraftRowIdRef.current = 1;
    setCreatingTransfer(false);
  }

  function openCreateTransferDrawer() {
    resetCreateForm();
    setShowCreateDrawer(true);
  }

  function closeCreateTransferDrawer() {
    setShowCreateDrawer(false);
  }

  function removeDraftItemRow(rowId: number) {
    setDraftItems((current) => current.filter((item) => item.rowId !== rowId));
  }

  function toggleDraftVariant(variantId: number) {
    const available = getOriginVariantAvailableStock(variantId);
    if (available <= 0) {
      showAlert('Esta variante ya no tiene stock disponible en la tienda de origen.', 'warning');
      return;
    }
    setDraftItems((current) => {
      if (current.some((item) => item.variantId === variantId)) {
        return current.filter((item) => item.variantId !== variantId);
      }
      return [...current, { rowId: nextDraftRowIdRef.current++, variantId, quantity: 1 }];
    });
  }

  function setDraftQuantity(rowId: number, value: string) {
    const quantity = Number(value);
    const normalized = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 0;
    setDraftItems((current) => current.map((item) => (
      item.rowId === rowId
        ? { ...item, quantity: Math.min(normalized, getOriginVariantAvailableStock(Number(item.variantId || 0))) }
        : item
    )));
  }

  function adjustDraftQuantity(rowId: number, delta: number) {
    setDraftItems((current) => current.map((item) => {
      if (item.rowId !== rowId || !item.variantId) {
        return item;
      }
      const available = getOriginVariantAvailableStock(item.variantId);
      return { ...item, quantity: Math.min(available, Math.max(1, item.quantity + delta)) };
    }));
  }

  function getOriginVariantAvailableStock(variantId: number): number {
    return originVariantStockById[variantId] || 0;
  }

  function selectOriginStore(nextValue: string) {
    const nextStoreId = toPositiveInt(nextValue);
    if (nextStoreId !== fromStoreId && draftItems.length > 0) {
      showAlert('Se limpio la seleccion porque cambiaste la tienda de origen.', 'info');
    }
    setFromStoreId(nextStoreId);
    setSelectedProductId(null);
    setVariantAxis('color');
    setActiveVariantFilter('');
    setVariantSearch('');
    setDraftItems([]);
  }

  function renderVariantChoice(variant: TransferVariantOption, label: string) {
    const available = getOriginVariantAvailableStock(variant.variantId);
    const isSelected = selectedVariantIds.has(variant.variantId);
    return (
      <button
        key={variant.variantId}
        type="button"
        className={`transfer-variant-choice-next${isSelected ? ' is-selected' : ''}`}
        aria-pressed={isSelected}
        onClick={(event) => {
          toggleDraftVariant(variant.variantId);
          if (isSelected && event.detail > 0) {
            event.currentTarget.blur();
          }
        }}
      >
        <strong>{label}</strong>
        <span>{isSelected ? 'Agregada' : `Disp. ${available}`}</span>
      </button>
    );
  }

  function renderProductVariantPicker(product: TransferProductOption) {
    if (!product.hasColor && !product.hasSize) {
      return (
        <div className="transfer-single-variant-next">
          {renderVariantChoice(product.variants[0], 'Variante única')}
        </div>
      );
    }

    if (!(product.hasColor && product.hasSize)) {
      return (
        <div className="transfer-variant-choice-grid-next">
          {product.variants.map((variant) => renderVariantChoice(
            variant,
            product.hasColor ? variant.colorName : variant.sizeName,
          ))}
        </div>
      );
    }

    const sizes = Array.from(new Set(product.variants.map((variant) => variant.sizeName)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const colors = Array.from(new Set(product.variants.map((variant) => variant.colorName)))
      .sort((a, b) => a.localeCompare(b));
    const axisOptions = variantAxis === 'color' ? colors : sizes;
    const activeAxisValue = axisOptions.includes(activeVariantFilter) ? activeVariantFilter : '';
    const variantsForMobileAxis = activeAxisValue
      ? product.variants.filter((variant) => (
        variantAxis === 'color'
          ? variant.colorName === activeAxisValue
          : variant.sizeName === activeAxisValue
      ))
      : [];

    return (
      <>
        <div className="transfer-variant-matrix-wrap-next">
          <table className="transfer-variant-matrix-next">
            <thead>
              <tr>
                <th>Color \ Talla</th>
                {sizes.map((size) => <th key={size}>{size}</th>)}
              </tr>
            </thead>
            <tbody>
              {colors.map((color) => (
                <tr key={color}>
                  <th>{color}</th>
                  {sizes.map((size) => {
                    const variant = product.variants.find((item) => item.colorName === color && item.sizeName === size);
                    return (
                      <td key={size}>
                        {variant ? renderVariantChoice(variant, size) : <span className="transfer-variant-missing-next">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="transfer-mobile-matrix-next">
          <div className="transfer-axis-switch-next" role="group" aria-label="Ordenar variantes por">
            <button
              type="button"
              className={variantAxis === 'color' ? 'is-active' : ''}
              aria-pressed={variantAxis === 'color'}
              onClick={() => {
                setVariantAxis('color');
                setActiveVariantFilter('');
              }}
            >
              Por color
            </button>
            <button
              type="button"
              className={variantAxis === 'size' ? 'is-active' : ''}
              aria-pressed={variantAxis === 'size'}
              onClick={() => {
                setVariantAxis('size');
                setActiveVariantFilter('');
              }}
            >
              Por talla
            </button>
          </div>

          <div className="variant-chip-row" role="group" aria-label={variantAxis === 'color' ? 'Color' : 'Talla'}>
            {axisOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={`variant-chip${option === activeAxisValue ? ' is-active' : ''}`}
                aria-pressed={option === activeAxisValue}
                onClick={() => setActiveVariantFilter((current) => current === option ? '' : option)}
              >
                {option}
                <span className="variant-chip-count">
                  {product.variants.filter((variant) => (
                    variantAxis === 'color' ? variant.colorName === option : variant.sizeName === option
                  )).length}
                </span>
              </button>
            ))}
          </div>
          {activeAxisValue ? (
            <div className="transfer-variant-choice-grid-next">
              {variantsForMobileAxis.map((variant) => renderVariantChoice(
                variant,
                variantAxis === 'color' ? variant.sizeName : variant.colorName,
              ))}
            </div>
          ) : (
            <p className="transfer-axis-hint-next">
              Selecciona {variantAxis === 'color' ? 'un color' : 'una talla'} para ver sus combinaciones.
            </p>
          )}
        </div>
      </>
    );
  }

  async function saveTransfer() {
    if (!fromStoreId || !toStoreId) {
      showAlert('Debes seleccionar tienda de origen y destino.', 'warning');
      return;
    }

    if (fromStoreId === toStoreId) {
      showAlert('La tienda de origen y destino no pueden ser la misma.', 'warning');
      return;
    }

    const itemAccumulator = new Map<number, number>();
    draftItems.forEach((item) => {
      const variantId = Number(item.variantId || 0);
      const quantity = Number(item.quantity || 0);
      if (!Number.isInteger(variantId) || variantId <= 0 || quantity <= 0) {
        return;
      }
      itemAccumulator.set(variantId, (itemAccumulator.get(variantId) || 0) + Math.floor(quantity));
    });

    const items = Array.from(itemAccumulator.entries()).map(([variantId, quantity]) => ({ variantId, quantity }));
    if (items.length === 0) {
      showAlert('Debes agregar al menos una variante con cantidad valida.', 'warning');
      return;
    }

    const exceedsStock = items.find((item) => item.quantity > (originVariantStockById[item.variantId] || 0));
    if (exceedsStock) {
      showAlert('Una o mas cantidades superan el stock disponible en tienda origen.', 'warning');
      return;
    }

    setCreatingTransfer(true);
    try {
      const response = await fetch('/api/admin/inventory/transfers', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          fromStoreId,
          toStoreId,
          items,
          note: transferNote.trim() || undefined,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { message?: unknown } | null)?.message || 'Error al crear transferencia.'), 'error');
        return;
      }

      showAlert('Transferencia creada correctamente.', 'success');
      closeCreateTransferDrawer();
      loadTransfers();
    } catch {
      showAlert('Error al crear transferencia.', 'error');
    } finally {
      setCreatingTransfer(false);
    }
  }

  async function receiveTransfer(transfer: StockTransfer) {
    if (transfer.status !== 'IN_TRANSIT') {
      showAlert('Solo una transferencia en transito puede recibirse.', 'warning');
      return;
    }
    setReceivingTransferIds((current) => (current.includes(transfer.id) ? current : [...current, transfer.id]));
    try {
      const response = await fetch(`/api/admin/inventory/transfers/${transfer.id}/receive`, {
        method: 'PATCH',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { message?: unknown } | null)?.message || 'Error al recibir transferencia.'), 'error');
        return;
      }

      showAlert(`Transferencia ${transfer.code} recibida.`, 'success');
      loadTransfers();
    } catch {
      showAlert('Error al recibir transferencia.', 'error');
    } finally {
      setReceivingTransferIds((current) => current.filter((id) => id !== transfer.id));
    }
  }

  async function dispatchTransfer(transfer: StockTransfer) {
    if (transfer.status !== 'PENDING') {
      showAlert('Solo una transferencia pendiente puede despacharse.', 'warning');
      return;
    }

    setDispatchingTransferIds((current) => current.includes(transfer.id) ? current : [...current, transfer.id]);
    try {
      const response = await fetch(`/api/admin/inventory/transfers/${transfer.id}/dispatch`, { method: 'PATCH' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { message?: unknown } | null)?.message || 'Error al despachar transferencia.'), 'error');
        return;
      }
      showAlert(`Transferencia ${transfer.code} despachada.`, 'success');
      loadTransfers();
    } catch {
      showAlert('Error al despachar transferencia.', 'error');
    } finally {
      setDispatchingTransferIds((current) => current.filter((id) => id !== transfer.id));
    }
  }

  function isReceiving(transferId: number): boolean {
    return receivingTransferIds.includes(transferId);
  }

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card inventory-header-card">
        <div>
          <p className="section-kicker">Operacion multitienda</p>
          <h1 className="section-title">Transferencias de stock</h1>
          <p className="section-subtitle">Crea y recibe transferencias entre tiendas.</p>
        </div>
        <div className="inventory-header-actions">
          <Link href="/admin/inventory" className="admin-ghost-btn">Volver a inventario</Link>
          <button type="button" className="admin-ghost-btn" onClick={loadTransfers}>Actualizar</button>
          <button type="button" className="admin-primary-btn" onClick={openCreateTransferDrawer}>Nueva transferencia</button>
        </div>
      </article>

      <nav className="admin-card inventory-mobile-actions-next" aria-label="Acciones de transferencias">
        <Link href="/admin/inventory" className="admin-ghost-btn">Volver a inventario</Link>
        <button type="button" className="admin-ghost-btn" onClick={loadTransfers}>Actualizar</button>
        <button type="button" className="admin-primary-btn" onClick={openCreateTransferDrawer}>Nueva transferencia</button>
      </nav>

      <article className="admin-card inventory-filters-card">
        <div className="transfer-filter-grid">
          <label className="inventory-field">
            <span>Buscar transferencia</span>
            <input
              type="text"
              value={searchParam}
              onChange={(event) => setSearchParam(event.target.value)}
              placeholder="Codigo, tienda, nota o usuario"
            />
          </label>

          <div className="inventory-field">
            <span>Estado</span>
            <AdminSelect
              value={statusFilter}
              options={TRANSFER_STATUS_OPTIONS}
              ariaLabel="Filtrar transferencias por estado"
              onChange={(nextValue) => setStatusFilter(toStatusFilter(nextValue))}
            />
          </div>
        </div>
      </article>

      <article className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table ops-cards-next">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Estado</th>
                <th>Origen</th>
                <th>Destino</th>
                <th>Creado</th>
                <th>Recibido</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransfers.length === 0 ? (
                <tr>
                  <AdminTableEmptyState
                    colSpan={7}
                    title="No encontramos transferencias"
                    description="Ajusta la busqueda o los filtros de origen, destino y estado."
                  />
                </tr>
              ) : (
                filteredTransfers.map((transfer) => (
                  <tr key={transfer.id}>
                    <td data-label="Codigo" className="list-card-title-next">
                      <div>
                        <strong>{transfer.code}</strong>
                        <br />
                        <small>#{transfer.id}</small>
                      </div>
                    </td>
                    <td data-label="Estado" className="ops-status-next">
                      <span className={`admin-status-badge ${getStatusClass(transfer.status)}`}>
                        {getStatusLabel(transfer.status)}
                      </span>
                    </td>
                    <td data-label="Origen">
                      <div>
                        {transfer.fromStore.name}
                        <br />
                        <small>{transfer.fromStore.code}</small>
                      </div>
                    </td>
                    <td data-label="Destino">
                      <div>
                        {transfer.toStore.name}
                        <br />
                        <small>{transfer.toStore.code}</small>
                      </div>
                    </td>
                    <td data-label="Creado">
                      <div>
                        {formatDate(transfer.createdAt)}
                        <br />
                        <small>{getUserFullName(transfer.createdBy || null)}</small>
                      </div>
                    </td>
                    <td data-label="Recibido">
                      {transfer.status === 'RECEIVED' ? (
                        <div>
                          {formatDate(transfer.updatedAt)}
                          <br />
                          <small>{getUserFullName(transfer.receivedBy || null)}</small>
                        </div>
                      ) : (
                        <small>Pendiente</small>
                      )}
                    </td>
                    <td data-label="Accion">
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-ghost-btn"
                          onClick={() => {
                            setSelectedTransferDetails(transfer);
                            setShowTransferDetails(true);
                          }}
                        >
                          Ver
                        </button>
                        {transfer.status === 'PENDING' ? (
                          <button
                            type="button"
                            className="admin-primary-btn"
                            disabled={dispatchingTransferIds.includes(transfer.id)}
                            onClick={() => dispatchTransfer(transfer)}
                          >
                            {dispatchingTransferIds.includes(transfer.id) ? 'Despachando...' : 'Despachar'}
                          </button>
                        ) : null}
                        {transfer.status === 'IN_TRANSIT' ? (
                          <button
                            type="button"
                            className="admin-primary-btn"
                            disabled={isReceiving(transfer.id)}
                            onClick={() => receiveTransfer(transfer)}
                          >
                            {isReceiving(transfer.id) ? 'Recibiendo...' : 'Recibir'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {showTransferDetails && selectedTransferDetails ? (
        <>
          <div className="admin-modal-overlay transfer-overlay" onClick={() => setShowTransferDetails(false)} />
          <section
            className="transfer-details-modal-next"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="transfer-details-header-next">
              <div>
                <h3>Detalle de transferencia {selectedTransferDetails.code}</h3>
                <p>Movimiento #{selectedTransferDetails.id}</p>
              </div>
              <button
                type="button"
                className="admin-modal-close-next"
                onClick={() => {
                  setShowTransferDetails(false);
                  setSelectedTransferDetails(null);
                }}
                aria-label="Cerrar detalle de transferencia"
              >
                x
              </button>
            </div>

            <div className="transfer-details-grid-next">
              <div>
                <p className="transfer-details-label-next">Estado</p>
                <span className={`admin-status-badge ${getStatusClass(selectedTransferDetails.status)}`}>
                  {getStatusLabel(selectedTransferDetails.status)}
                </span>
              </div>
              <div>
                <p className="transfer-details-label-next">Origen</p>
                <p>{selectedTransferDetails.fromStore.name} ({selectedTransferDetails.fromStore.code})</p>
              </div>
              <div>
                <p className="transfer-details-label-next">Destino</p>
                <p>{selectedTransferDetails.toStore.name} ({selectedTransferDetails.toStore.code})</p>
              </div>
              <div>
                <p className="transfer-details-label-next">Creado</p>
                <p>{formatDate(selectedTransferDetails.createdAt)}</p>
                <p className="admin-muted-text">{getUserFullName(selectedTransferDetails.createdBy || null)}</p>
              </div>
              <div>
                <p className="transfer-details-label-next">Recibido</p>
                {selectedTransferDetails.status === 'RECEIVED' ? (
                  <>
                    <p>{formatDate(selectedTransferDetails.updatedAt)}</p>
                    <p className="admin-muted-text">{getUserFullName(selectedTransferDetails.receivedBy || null)}</p>
                  </>
                ) : (
                  <p className="admin-muted-text">Pendiente</p>
                )}
              </div>
            </div>

            <div className="transfer-items-box-next">
              <h4>Items del movimiento</h4>
              {selectedTransferDetails.items.length === 0 ? (
                <p className="admin-muted-text">Sin items registrados.</p>
              ) : (
                <div className="transfer-item-list-next">
                  {selectedTransferDetails.items.map((item) => (
                    <article key={item.id} className="transfer-item-card-next">
                      <div className="transfer-item-text-next">
                        <p className="transfer-item-name-next">{item.variant.product.name || 'Variante'}</p>
                        <p className="transfer-item-meta-next">
                          {item.variant.color.name || 'Sin color'} / {item.variant.size.name || 'Sin talla'}
                        </p>
                        <p className="transfer-item-sku-next">{item.variant.sku || `#${item.variantId}`}</p>
                      </div>
                      <span className="admin-status-badge info">x{item.quantity}</span>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {selectedTransferDetails.note ? (
              <div className="transfer-note-box-next">
                <p className="transfer-details-label-next">Nota</p>
                <p>{selectedTransferDetails.note}</p>
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {showCreateDrawer ? (
        <>
          <div className="admin-modal-overlay transfer-overlay" onClick={closeCreateTransferDrawer} />
          <aside className="transfer-drawer-next">
            <div className="inventory-drawer-head">
              <div>
                <h3>Nueva transferencia</h3>
                <p>Completa origen, destino e items para crear la transferencia.</p>
              </div>
              <button type="button" className="admin-ghost-btn" onClick={closeCreateTransferDrawer}>
                Cerrar
              </button>
            </div>

            <div className="inventory-drawer-body">
              <div className="inventory-field">
                <span>Tienda origen</span>
                <AdminSelect
                  value={String(fromStoreId || '')}
                  options={[
                    { value: '', label: 'Selecciona tienda origen' },
                    ...storeOptions.map((store) => ({ value: String(store.id), label: `${store.name} (${store.code})` })),
                  ]}
                  ariaLabel="Seleccionar tienda origen"
                  onChange={selectOriginStore}
                />
              </div>

              <div className="inventory-field">
                <span>Tienda destino</span>
                <AdminSelect
                  value={String(toStoreId || '')}
                  options={[
                    { value: '', label: 'Selecciona tienda destino' },
                    ...storeOptions.map((store) => ({ value: String(store.id), label: `${store.name} (${store.code})` })),
                  ]}
                  ariaLabel="Seleccionar tienda destino"
                  onChange={(nextValue) => {
                    setToStoreId(toPositiveInt(nextValue));
                    setSelectedProductId(null);
    setVariantAxis('color');
    setActiveVariantFilter('');
                  }}
                />
              </div>

              <label className="inventory-field">
                <span>Buscar producto</span>
                <input
                  type="search"
                  value={variantSearch}
                  onChange={(event) => setVariantSearch(event.target.value)}
                  placeholder="Nombre del producto o SKU"
                  disabled={!fromStoreId || !toStoreId || fromStoreId === toStoreId || loadingOriginInventory}
                />
                {!fromStoreId || !toStoreId ? (
                  <small className="admin-muted-text">Selecciona tienda de origen y destino para buscar productos.</small>
                ) : null}
                {fromStoreId && toStoreId && fromStoreId === toStoreId ? (
                  <small className="admin-muted-text">La tienda de destino debe ser diferente a la de origen.</small>
                ) : null}
                {fromStoreId && toStoreId && loadingOriginInventory ? (
                  <small className="admin-muted-text">Cargando productos disponibles...</small>
                ) : null}
              </label>

              {fromStoreId && toStoreId && fromStoreId !== toStoreId && !loadingOriginInventory ? (
                <section className="transfer-product-results-next" aria-label="Resultados de productos">
                  {!variantSearch.trim() ? (
                    <div className="transfer-search-hint-next">
                      <strong>Busca el producto padre</strong>
                      <span>Escribe su nombre o el SKU de una variante.</span>
                    </div>
                  ) : productSearchResults.length === 0 ? (
                    <div className="transfer-search-hint-next">
                      <strong>No encontramos productos con stock</strong>
                      <span>Prueba con otro nombre o SKU.</span>
                    </div>
                  ) : (
                    <div className="transfer-product-card-list-next">
                      {productSearchResults.map((product) => {
                        const isActive = selectedProductId === product.productId;
                        return (
                          <button
                            key={product.productId}
                            type="button"
                            className={`transfer-product-card-next${isActive ? ' is-active' : ''}`}
                            aria-expanded={isActive}
                            onClick={() => {
                              setSelectedProductId(product.productId);
                              setVariantAxis('color');
                              setActiveVariantFilter('');
                            }}
                          >
                            <span>
                              <strong>{product.productName}</strong>
                              <small>{product.variants.length} variantes con stock</small>
                            </span>
                            <span className="transfer-product-stock-next">{product.totalAvailable} disp.</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              ) : null}

              {selectedProduct ? (
                <section className="transfer-product-variants-next">
                  <div className="transfer-product-variants-head-next">
                    <div>
                      <span className="section-kicker">Variantes disponibles</span>
                      <h4>{selectedProduct.productName}</h4>
                    </div>
                    <button type="button" className="admin-ghost-btn" onClick={() => setSelectedProductId(null)}>
                      Cerrar
                    </button>
                  </div>
                  {renderProductVariantPicker(selectedProduct)}
                </section>
              ) : null}

              <section className="transfer-selection-next">
                <div className="transfer-draft-box-head-next">
                  <div>
                    <p>Selección para transferir</p>
                    <small>{draftItems.length} variantes · {selectedUnitCount} unidades</small>
                  </div>
                </div>

                {draftItems.length === 0 ? (
                  <div className="transfer-selection-empty-next">
                    Selecciona una combinación de color y talla para agregarla.
                  </div>
                ) : (
                  <>
                    <div className="admin-table-wrap transfer-selection-table-wrap-next transfer-desktop-selection-next">
                      <table className="admin-table transfer-selection-table-next">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Variante</th>
                          <th>Disponible</th>
                          <th>Cantidad</th>
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draftItems.map((item) => {
                          const variant = variantCatalog.find((entry) => entry.variantId === item.variantId);
                          if (!variant || !item.variantId) return null;
                          const available = getOriginVariantAvailableStock(item.variantId);
                          const variantName = variant.isUnique
                            ? 'Variante única'
                            : [variant.colorName, variant.sizeName].filter(Boolean).join(' / ');
                          return (
                            <tr key={item.rowId}>
                              <td data-label="Producto"><strong>{variant.productName}</strong></td>
                              <td data-label="Variante">
                                <span>{variantName}</span>
                                <small>{variant.sku}</small>
                              </td>
                              <td data-label="Disponible">{available}</td>
                              <td data-label="Cantidad">
                                <div className="transfer-qty-stepper-next">
                                  <button type="button" aria-label={`Restar una unidad de ${variant.productName}`} onClick={() => adjustDraftQuantity(item.rowId, -1)}>−</button>
                                  <input
                                    type="number"
                                    min={1}
                                    max={available}
                                    value={item.quantity}
                                    aria-label={`Cantidad de ${variant.productName} ${variantName}`}
                                    onChange={(event) => setDraftQuantity(item.rowId, event.target.value)}
                                  />
                                  <button type="button" aria-label={`Sumar una unidad de ${variant.productName}`} onClick={() => adjustDraftQuantity(item.rowId, 1)}>+</button>
                                </div>
                              </td>
                              <td data-label="Acción">
                                <button type="button" className="admin-ghost-btn" onClick={() => removeDraftItemRow(item.rowId)}>Quitar</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      </table>
                    </div>

                    <div className="transfer-mobile-selection-next">
                      {selectedProductGroups.map((group) => (
                        <article key={group.productId} className="transfer-mobile-product-group-next">
                          <div className="transfer-mobile-product-title-next">
                            <strong>{group.productName}</strong>
                            <span>{group.entries.length} {group.entries.length === 1 ? 'variante' : 'variantes'}</span>
                          </div>
                          <div className="transfer-mobile-selected-list-next">
                            {group.entries.map(({ item, variant }) => {
                              const available = getOriginVariantAvailableStock(variant.variantId);
                              const variantName = variant.isUnique
                                ? 'Variante única'
                                : [variant.colorName, variant.sizeName].filter(Boolean).join(' / ');
                              return (
                                <div key={item.rowId} className="transfer-mobile-selected-row-next">
                                  <div className="transfer-mobile-selected-copy-next" title={variant.sku}>
                                    <strong>{variantName}</strong>
                                    <small>Disp. {available} · {variant.sku}</small>
                                  </div>
                                  <div className="transfer-qty-stepper-next">
                                    <button type="button" aria-label={`Restar una unidad de ${variant.productName}`} onClick={() => adjustDraftQuantity(item.rowId, -1)}>−</button>
                                    <input
                                      type="number"
                                      min={1}
                                      max={available}
                                      value={item.quantity}
                                      aria-label={`Cantidad de ${variant.productName} ${variantName}`}
                                      onChange={(event) => setDraftQuantity(item.rowId, event.target.value)}
                                    />
                                    <button type="button" aria-label={`Sumar una unidad de ${variant.productName}`} onClick={() => adjustDraftQuantity(item.rowId, 1)}>+</button>
                                  </div>
                                  <button
                                    type="button"
                                    className="transfer-mobile-remove-next"
                                    aria-label={`Quitar ${variant.productName} ${variantName}`}
                                    onClick={() => removeDraftItemRow(item.rowId)}
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </section>

              <label className="inventory-field">
                <span>Nota</span>
                <textarea
                  rows={3}
                  value={transferNote}
                  onChange={(event) => setTransferNote(event.target.value)}
                  placeholder="Motivo o detalle opcional"
                />
              </label>
            </div>

            <div className="inventory-drawer-foot">
              <button type="button" className="admin-ghost-btn" onClick={closeCreateTransferDrawer}>
                Cancelar
              </button>
              <button type="button" className="admin-primary-btn" disabled={!canCreateTransfer} onClick={saveTransfer}>
                {creatingTransfer ? 'Creando...' : `Crear transferencia · ${selectedUnitCount} unidades`}
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}
