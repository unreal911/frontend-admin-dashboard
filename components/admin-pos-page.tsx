'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { useAdminUi } from '@/components/admin-ui-provider';
import { AdminSelect, AdminSelectOption } from '@/components/admin-select';
import {
  AdminOrder,
  normalizeOrdersListResponse,
  normalizeVariantStockResponse,
} from '@/lib/admin-order-types';
import {
  AdminCustomer,
  customerDocumentLabel,
  normalizeCustomer,
  normalizeCustomersResponse,
} from '@/lib/admin-customer-types';

type PosDocType = 'NOTA' | 'BOLETA' | 'FACTURA';

const POS_DOC_TYPE_STORAGE_KEY = 'pos_doc_type';

const POS_DOC_TYPE_LABELS: Record<PosDocType, string> = {
  NOTA: 'Nota de venta',
  BOLETA: 'Boleta',
  FACTURA: 'Factura',
};

interface PosStore {
  id: number;
  name: string;
  code: string;
}

interface PosVariant {
  id: number;
  sku: string;
  barcode?: string | null;
  colorName: string;
  colorHex?: string | null;
  sizeName: string;
  price: number;
  imageUrl?: string | null;
  stock: number;
  reservedStock: number;
  availableStock: number;
}

interface PosRemoteStockOption {
  storeId: number;
  storeName: string;
  storeType?: string | null;
  availableStock: number;
  reservedStock: number;
}

interface PosProduct {
  id: number;
  name: string;
  categoryName: string;
  imageUrl?: string | null;
  variants: PosVariant[];
  minPrice: number;
  totalAvailableStock: number;
  totalReservedStock: number;
  hasColor: boolean;
  hasSize: boolean;
}

interface PosCartItem {
  variantId: number;
  fulfillmentStoreId: number;
  fulfillmentStoreName: string;
  productId: number;
  productName: string;
  colorName: string;
  sizeName: string;
  sku: string;
  imageUrl?: string | null;
  unitPrice: number;
  quantity: number;
  availableStock: number;
  subtotal: number;
}

const DEFAULT_PAYMENT_METHODS = ['Efectivo', 'Tarjeta', 'Yape', 'Plin', 'Transferencia'];
const LOW_STOCK_THRESHOLD = 10;

function asText(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asPositiveInt(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) {
    return null;
  }
  return numeric;
}

function extractArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown[] }).data)) {
    return (payload as { data: unknown[] }).data;
  }
  return [];
}

function normalizeStores(payload: unknown): PosStore[] {
  const rows = extractArray(payload);
  return rows
    .map((row) => {
      const id = asPositiveInt((row as { id?: unknown }).id);
      if (!id) return null;
      return {
        id,
        name: asText((row as { name?: unknown }).name, `Tienda #${id}`),
        code: asText((row as { code?: unknown }).code, '-'),
      };
    })
    .filter((row): row is PosStore => Boolean(row));
}

function normalizePaymentMethods(payload: unknown): string[] {
  const rows = extractArray(payload);
  const unique = new Set<string>();
  rows.forEach((row) => {
    const name = asText((row as { name?: unknown }).name);
    if (name) unique.add(name);
  });
  return Array.from(unique.values());
}

function normalizeRemoteStockOptions(payload: unknown): PosRemoteStockOption[] {
  const rows = extractArray(payload);
  const options: PosRemoteStockOption[] = [];
  rows.forEach((row) => {
    const raw = row as Record<string, unknown>;
    const storeId = asPositiveInt(raw.storeId);
    if (!storeId) return;
    const availableStock = Math.max(0, asNumber(raw.availableStock, 0));
    if (availableStock <= 0) return;
    options.push({
      storeId,
      storeName: asText(raw.storeName, `Tienda #${storeId}`),
      storeType: asText(raw.storeType) || null,
      availableStock,
      reservedStock: Math.max(0, asNumber(raw.reservedStock, 0)),
    });
  });
  return options.sort((a, b) => b.availableStock - a.availableStock);
}

function normalizeProducts(payload: unknown): PosProduct[] {
  const rows = extractArray(payload);

  const products = rows
    .map((row) => {
      const raw = row as Record<string, unknown>;
      const id = asPositiveInt(raw.id);
      if (!id) return null;

      const categoryRaw = raw.category as Record<string, unknown> | undefined;
      const variantsRaw = Array.isArray(raw.variants) ? raw.variants : [];
      const imagesRaw = Array.isArray(raw.images) ? raw.images : [];
      const productImage = asText(raw.imageUrl)
        || asText((imagesRaw[0] as { url?: unknown } | undefined)?.url)
        || undefined;

      const variants = variantsRaw
        .map((variantRow) => {
          const variant = variantRow as Record<string, unknown>;
          const variantId = asPositiveInt(variant.id);
          if (!variantId) return null;

          const colorRaw = variant.color as Record<string, unknown> | undefined;
          const sizeRaw = variant.size as Record<string, unknown> | undefined;
          const imageRaw = variant.image as Record<string, unknown> | undefined;

          const imageUrl = asText(variant.imageUrl)
            || asText(imageRaw?.url)
            || productImage
            || undefined;

          return {
            id: variantId,
            sku: asText(variant.sku, `VAR-${variantId}`),
            barcode: asText(variant.barcode) || null,
            colorName: asText(colorRaw?.name, 'Sin color'),
            colorHex: asText(colorRaw?.hex) || null,
            sizeName: asText(sizeRaw?.name, 'Sin talla'),
            price: Math.max(0, asNumber(variant.price, 0)),
            imageUrl,
            stock: 0,
            reservedStock: 0,
            availableStock: 0,
          } satisfies PosVariant;
        })
        .filter(Boolean) as PosVariant[];

      if (variants.length === 0) {
        return null;
      }

      const minPrice = variants.reduce((acc, variant) => Math.min(acc, variant.price), Number.POSITIVE_INFINITY);

      // Ejes reales del producto: prioriza los flags del backend (null-based, sin
      // centinelas); fallback a detectar por variantes con color/talla presentes.
      const hasColor = typeof raw.hasColor === 'boolean'
        ? raw.hasColor
        : variantsRaw.some((v) => (v as { color?: unknown }).color != null);
      const hasSize = typeof raw.hasSize === 'boolean'
        ? raw.hasSize
        : variantsRaw.some((v) => (v as { size?: unknown }).size != null);

      return {
        id,
        name: asText(raw.name, `Producto #${id}`),
        categoryName: asText(categoryRaw?.name, 'Sin categoria'),
        imageUrl: productImage,
        variants,
        minPrice: Number.isFinite(minPrice) ? minPrice : 0,
        totalAvailableStock: 0,
        totalReservedStock: 0,
        hasColor,
        hasSize,
      } satisfies PosProduct;
    })
    .filter(Boolean) as PosProduct[];

  return products.sort((a, b) => a.name.localeCompare(b.name));
}

function withStockApplied(baseProducts: PosProduct[], stockMap: Map<number, { stock: number; reserved: number; available: number }>): PosProduct[] {
  return baseProducts.map((product) => {
    let totalAvailable = 0;
    let totalReserved = 0;

    const variants = product.variants.map((variant) => {
      const row = stockMap.get(variant.id);
      const stock = row?.stock ?? 0;
      const reserved = row?.reserved ?? 0;
      const available = row?.available ?? Math.max(0, stock - reserved);
      totalAvailable += available;
      totalReserved += reserved;

      return {
        ...variant,
        stock,
        reservedStock: reserved,
        availableStock: available,
      };
    });

    return {
      ...product,
      variants,
      totalAvailableStock: totalAvailable,
      totalReservedStock: totalReserved,
    };
  });
}

// Ejes del producto (color/talla) para adaptar la UI a los 3 tipos: SIMPLE (ninguna),
// una-dimension (solo talla o solo color) y MATRIX (ambas). Provienen del backend
// (flags null-based hasColor/hasSize), ya sin centinelas de nombre.
function getProductAxes(product: PosProduct): { hasColor: boolean; hasSize: boolean } {
  return { hasColor: product.hasColor, hasSize: product.hasSize };
}

function formatCurrency(value: number): string {
  return `S/ ${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function getStockChip(product: PosProduct): string {
  if (product.totalAvailableStock <= 0) return 'Sin stock';
  if (product.totalAvailableStock <= 10) return `Stock bajo (${product.totalAvailableStock})`;
  return `${product.totalAvailableStock} disponibles`;
}

function buildOrderNote(
  baseNote: string,
  paymentMethod: string,
  reference: string,
  paidAmount?: number,
  changeAmount?: number,
  clientAddress?: string,
): string {
  const address = asText(clientAddress);
  const parts = [
    asText(baseNote),
    `Metodo de pago: ${paymentMethod}`,
    `Ref: ${reference}`,
    Number.isFinite(paidAmount) ? `Monto recibido: ${Number(paidAmount).toFixed(2)}` : '',
    Number.isFinite(changeAmount) ? `Vuelto: ${Number(changeAmount).toFixed(2)}` : '',
    address ? `Direccion: ${address}` : '',
  ].filter(Boolean);
  return parts.join(' | ');
}

export function AdminPosPage() {
  const { showAlert } = useAdminUi();
  const { hasPermission } = useAdminAuth();

  const [stores, setStores] = useState<PosStore[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);

  const [productsBase, setProductsBase] = useState<PosProduct[]>([]);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // Idempotencia: clave estable por intento de cobro; se reusa en reintentos
  // (red/doble-clic) para que el backend no duplique la venta, y se limpia al exito.
  const idempotencyKeyRef = useRef<string | null>(null);

  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [applyIgv, setApplyIgv] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [variantQuantity, setVariantQuantity] = useState(1);
  const [remoteStockOptions, setRemoteStockOptions] = useState<PosRemoteStockOption[]>([]);
  const [loadingRemoteStock, setLoadingRemoteStock] = useState(false);
  const [selectedFulfillmentStoreId, setSelectedFulfillmentStoreId] = useState<number | null>(null);

  const [paymentMethods, setPaymentMethods] = useState<string[]>(DEFAULT_PAYMENT_METHODS);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(DEFAULT_PAYMENT_METHODS[0]);
  const [showPaymentDrawer, setShowPaymentDrawer] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clienteTipoDoc, setClienteTipoDoc] = useState('1');
  const [clienteNumDoc, setClienteNumDoc] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<AdminCustomer[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [saveNewCustomer, setSaveNewCustomer] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [amountPaid, setAmountPaid] = useState(0);

  const [salesHistory, setSalesHistory] = useState<AdminOrder[]>([]);
  const [loadingSalesHistory, setLoadingSalesHistory] = useState(false);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [boletaEnabled, setBoletaEnabled] = useState(false);
  const [facturaEnabled, setFacturaEnabled] = useState(false);
  const [docType, setDocType] = useState<PosDocType>('NOTA');
  const [pendingPrint, setPendingPrint] = useState<{ id: number; code: string } | null>(null);
  const canSell = hasPermission('pos.sell');
  const canCharge = hasPermission('pos.charge');
  const canCancelSale = hasPermission('pos.cancel_sale');
  const canViewCustomers = hasPermission('customers.view');
  const canManageCustomers = hasPermission('customers.manage');

  const selectedProduct = useMemo(() => (
    products.find((product) => product.id === selectedProductId) || null
  ), [products, selectedProductId]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((product) => set.add(product.categoryName || 'Sin categoria'));
    return ['Todos', ...Array.from(set.values()).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return products.filter((product) => {
      const categoryMatch = selectedCategory === 'Todos' || product.categoryName === selectedCategory;
      const searchMatch = !term
        || product.name.toLowerCase().includes(term)
        || product.categoryName.toLowerCase().includes(term)
        || product.variants.some((variant) =>
          variant.sku.toLowerCase().includes(term)
          || variant.colorName.toLowerCase().includes(term)
          || variant.sizeName.toLowerCase().includes(term)
          || asText(variant.barcode).toLowerCase().includes(term));
      return categoryMatch && searchMatch;
    });
  }, [products, searchTerm, selectedCategory]);

  const colorOptions = useMemo(() => {
    if (!selectedProduct) return [];
    const map = new Map<string, { name: string; hex: string | null }>();
    selectedProduct.variants.forEach((variant) => {
      if (!map.has(variant.colorName)) {
        map.set(variant.colorName, { name: variant.colorName, hex: variant.colorHex || null });
      }
    });
    return Array.from(map.values());
  }, [selectedProduct]);

  const sizeOptions = useMemo(() => {
    if (!selectedProduct) return [];
    return selectedProduct.variants.filter((variant) => {
      if (!selectedColor) return true;
      return variant.colorName === selectedColor;
    });
  }, [selectedProduct, selectedColor]);

  const selectedVariant = useMemo(() => {
    if (!selectedProduct) return null;
    const byColor = selectedProduct.variants.filter((variant) => (
      selectedColor ? variant.colorName === selectedColor : true
    ));
    if (byColor.length === 0) return null;
    if (selectedSize) {
      const exact = byColor.find((variant) => variant.sizeName === selectedSize);
      if (exact) return exact;
    }
    return byColor[0];
  }, [selectedProduct, selectedColor, selectedSize]);

  // Dimensiones del producto abierto en el selector: oculta Color/Talla vacios.
  const selectedProductAxes = useMemo(
    () => (selectedProduct ? getProductAxes(selectedProduct) : { hasColor: false, hasSize: false }),
    [selectedProduct],
  );

  const selectedStoreName = useMemo(() => (
    stores.find((store) => store.id === selectedStoreId)?.name || 'Tienda seleccionada'
  ), [selectedStoreId, stores]);

  const selectedRemoteStock = useMemo(() => {
    if (!selectedFulfillmentStoreId) return null;
    return remoteStockOptions.find((option) => option.storeId === selectedFulfillmentStoreId) || null;
  }, [remoteStockOptions, selectedFulfillmentStoreId]);

  const localVariantStock = Math.max(0, Number(selectedVariant?.availableStock || 0));
  const remoteVariantStock = Math.max(0, Number(selectedRemoteStock?.availableStock || 0));
  const shouldSuggestRemoteStock = Boolean(selectedVariant && localVariantStock <= LOW_STOCK_THRESHOLD);
  const effectiveVariantStock = localVariantStock + remoteVariantStock;

  const effectiveFulfillmentStoreId = localVariantStock > 0
    ? selectedStoreId
    : selectedRemoteStock?.storeId || null;

  const cartItemsCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const subtotal = useMemo(() => (
    cart.reduce((sum, item) => sum + item.subtotal, 0)
  ), [cart]);

  const tax = useMemo(() => (applyIgv ? subtotal * 0.18 : 0), [applyIgv, subtotal]);
  const total = useMemo(() => subtotal + tax, [subtotal, tax]);
  const change = useMemo(() => Math.max(0, amountPaid - total), [amountPaid, total]);

  const loadStores = useCallback(async () => {
    const response = await fetch('/api/admin/stores?skip=1&take=200', {
      method: 'GET',
      cache: 'no-store',
    }).catch(() => null);

    if (!response) {
      setStores([]);
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setStores([]);
      return;
    }

    const normalized = normalizeStores(payload);
    setStores(normalized);
    setSelectedStoreId((current) => {
      if (current && normalized.some((store) => store.id === current)) {
        return current;
      }
      return normalized[0]?.id || null;
    });
  }, []);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const response = await fetch('/api/admin/products?skip=1&take=300&isActive=true', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { error?: unknown; message?: unknown } | null)?.error
            || (payload as { error?: unknown; message?: unknown } | null)?.message
            || 'No se pudo cargar el catalogo POS.'),
          'error',
        );
        setProductsBase([]);
        setProducts([]);
        return;
      }
      const normalized = normalizeProducts(payload);
      setProductsBase(normalized);
      setProducts(normalized);
      if (selectedCategory !== 'Todos' && !normalized.some((product) => product.categoryName === selectedCategory)) {
        setSelectedCategory('Todos');
      }
    } catch {
      showAlert('No se pudo cargar el catalogo POS.', 'error');
      setProductsBase([]);
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [selectedCategory, showAlert]);

  const loadPaymentMethods = useCallback(async () => {
    const response = await fetch('/api/admin/payment-methods/active', {
      method: 'GET',
      cache: 'no-store',
    }).catch(() => null);

    if (!response) {
      setPaymentMethods(DEFAULT_PAYMENT_METHODS);
      setSelectedPaymentMethod(DEFAULT_PAYMENT_METHODS[0]);
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setPaymentMethods(DEFAULT_PAYMENT_METHODS);
      setSelectedPaymentMethod(DEFAULT_PAYMENT_METHODS[0]);
      return;
    }

    const normalized = normalizePaymentMethods(payload);
    const nextMethods = normalized.length > 0 ? normalized : DEFAULT_PAYMENT_METHODS;
    setPaymentMethods(nextMethods);
    setSelectedPaymentMethod((current) => (
      nextMethods.includes(current) ? current : nextMethods[0]
    ));
  }, []);

  const loadSalesHistory = useCallback(async (storeId: number | null) => {
    setLoadingSalesHistory(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '12',
        channel: 'POS',
      });
      if (storeId) {
        params.set('storeId', String(storeId));
      }

      const response = await fetch(`/api/admin/orders?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setSalesHistory([]);
        return;
      }

      const normalized = normalizeOrdersListResponse(payload);
      setSalesHistory(normalized.data);
    } catch {
      setSalesHistory([]);
    } finally {
      setLoadingSalesHistory(false);
    }
  }, []);

  const loadStoreStock = useCallback(async (storeId: number, baseCatalog: PosProduct[]) => {
    if (!storeId || baseCatalog.length === 0) {
      setProducts(baseCatalog);
      return;
    }

    const variantIds = baseCatalog.flatMap((product) => product.variants.map((variant) => variant.id));
    if (variantIds.length === 0) {
      setProducts(baseCatalog);
      return;
    }

    setLoadingStock(true);
    try {
      const chunks: number[][] = [];
      for (let index = 0; index < variantIds.length; index += 120) {
        chunks.push(variantIds.slice(index, index + 120));
      }

      const stockMap = new Map<number, { stock: number; reserved: number; available: number }>();

      for (const chunk of chunks) {
        const params = new URLSearchParams({
          storeId: String(storeId),
          variantIds: chunk.join(','),
        });
        const response = await fetch(`/api/admin/orders/variant-stock?${params.toString()}`, {
          method: 'GET',
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          continue;
        }

        const rows = normalizeVariantStockResponse(payload);
        rows.forEach((row) => {
          stockMap.set(row.variantId, {
            stock: row.stock,
            reserved: row.reservedStock,
            available: row.availableStock,
          });
        });
      }

      const catalogWithStock = withStockApplied(baseCatalog, stockMap);
      setProducts(catalogWithStock);
      setCart((current) => current.flatMap((item) => {
        const row = stockMap.get(item.variantId);
        if (item.fulfillmentStoreId !== storeId) {
          return [item];
        }
        const available = row?.available ?? 0;
        const nextQuantity = Math.max(0, Math.min(item.quantity, available));
        if (nextQuantity <= 0) {
          return [];
        }
        return [{
          ...item,
          availableStock: available,
          quantity: nextQuantity,
          subtotal: nextQuantity * item.unitPrice,
        }];
      }));
    } finally {
      setLoadingStock(false);
    }
  }, []);

  const loadRemoteStockOptions = useCallback(async (variantId: number, currentStoreId: number) => {
    setLoadingRemoteStock(true);
    setRemoteStockOptions([]);
    setSelectedFulfillmentStoreId(null);
    try {
      const params = new URLSearchParams({ excludeStoreId: String(currentStoreId) });
      const response = await fetch(`/api/admin/orders/remote-stock/${variantId}?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return;
      }
      const options = normalizeRemoteStockOptions(payload);
      setRemoteStockOptions(options);
      setSelectedFulfillmentStoreId(options[0]?.storeId || null);
    } finally {
      setLoadingRemoteStock(false);
    }
  }, []);

  useEffect(() => {
    loadStores();
    loadProducts();
    loadPaymentMethods();
  }, [loadStores, loadProducts, loadPaymentMethods]);

  useEffect(() => {
    const query = customerQuery.trim();
    if (!showPaymentDrawer || !canViewCustomers || query.length < 2) {
      setCustomerResults([]);
      setSearchingCustomers(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchingCustomers(true);
      try {
        const params = new URLSearchParams({ search: query, isActive: 'true', page: '1', limit: '8' });
        const response = await fetch(`/api/admin/customers?${params}`, { cache: 'no-store', signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (response.ok) setCustomerResults(normalizeCustomersResponse(payload).data);
        else setCustomerResults([]);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) setCustomerResults([]);
      } finally {
        if (!controller.signal.aborted) setSearchingCustomers(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [canViewCustomers, customerQuery, showPaymentDrawer]);

  // Restaura el ultimo tipo de comprobante elegido (solo etiqueta impresa)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(POS_DOC_TYPE_STORAGE_KEY);
      if (saved === 'NOTA' || saved === 'BOLETA' || saved === 'FACTURA') {
        setDocType(saved);
      }
    } catch {
      // localStorage no disponible
    }
  }, []);

  // Habilitacion de Boleta/Factura desde Configuracion
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch('/api/admin/system-config/order-workflow', { method: 'GET', cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!active || !response.ok) return;
        const data = (payload as { data?: { posBoletaEnabled?: unknown; posFacturaEnabled?: unknown } } | null)?.data || {};
        setBoletaEnabled(data.posBoletaEnabled === true);
        setFacturaEnabled(data.posFacturaEnabled === true);
      } catch {
        // sin config: solo Nota de venta
      }
    })();
    return () => { active = false; };
  }, []);

  // Si se deshabilita el tipo actual, vuelve a Nota de venta
  useEffect(() => {
    if (docType === 'BOLETA' && !boletaEnabled) setDocType('NOTA');
    if (docType === 'FACTURA' && !facturaEnabled) setDocType('NOTA');
  }, [docType, boletaEnabled, facturaEnabled]);

  const docTypeOptions = useMemo<AdminSelectOption<PosDocType>[]>(() => {
    const options: AdminSelectOption<PosDocType>[] = [{ value: 'NOTA', label: POS_DOC_TYPE_LABELS.NOTA }];
    if (boletaEnabled) options.push({ value: 'BOLETA', label: POS_DOC_TYPE_LABELS.BOLETA });
    if (facturaEnabled) options.push({ value: 'FACTURA', label: POS_DOC_TYPE_LABELS.FACTURA });
    return options;
  }, [boletaEnabled, facturaEnabled]);

  function updateDocType(next: PosDocType) {
    setDocType(next);
    try {
      window.localStorage.setItem(POS_DOC_TYPE_STORAGE_KEY, next);
    } catch {
      // localStorage no disponible
    }
  }

  useEffect(() => {
    if (!selectedStoreId) return;
    loadSalesHistory(selectedStoreId);
  }, [loadSalesHistory, selectedStoreId]);

  useEffect(() => {
    if (!selectedStoreId || productsBase.length === 0) return;
    loadStoreStock(selectedStoreId, productsBase);
  }, [loadStoreStock, productsBase, selectedStoreId]);

  useEffect(() => {
    if (!selectedProduct) return;
    if (!selectedVariant) return;

    setSelectedColor((current) => current || selectedVariant.colorName);
    setSelectedSize((current) => current || selectedVariant.sizeName);
  }, [selectedProduct, selectedVariant]);

  useEffect(() => {
    if (!selectedVariant || !selectedStoreId) {
      setRemoteStockOptions([]);
      setSelectedFulfillmentStoreId(null);
      return;
    }

    if (selectedVariant.availableStock > LOW_STOCK_THRESHOLD) {
      setRemoteStockOptions([]);
      setSelectedFulfillmentStoreId(null);
      return;
    }

    loadRemoteStockOptions(selectedVariant.id, selectedStoreId);
  }, [loadRemoteStockOptions, selectedStoreId, selectedVariant]);

  useEffect(() => {
    if (!selectedVariant) return;
    setVariantQuantity((current) => {
      const safe = Math.floor(Number(current || 1));
      const max = Math.max(1, effectiveVariantStock);
      return Math.max(1, Math.min(max, safe));
    });
  }, [effectiveVariantStock, selectedVariant]);

  function openVariantSelector(product: PosProduct) {
    if (!canSell) {
      showAlert('No tienes permiso para agregar productos al carrito POS.', 'error');
      return;
    }

    const firstVariant = product.variants[0];
    if (!firstVariant) {
      showAlert('Este producto no tiene variantes activas.', 'warning');
      return;
    }
    setSelectedProductId(product.id);
    setSelectedColor(firstVariant.colorName);
    setSelectedSize(firstVariant.sizeName);
    setRemoteStockOptions([]);
    setSelectedFulfillmentStoreId(null);
    setVariantQuantity(Math.min(1, Math.max(1, firstVariant.availableStock || 1)));
  }

  function closeVariantSelector() {
    setSelectedProductId(null);
    setSelectedColor('');
    setSelectedSize('');
    setRemoteStockOptions([]);
    setSelectedFulfillmentStoreId(null);
    setVariantQuantity(1);
  }

  function updateCartQuantity(item: PosCartItem, nextQuantityRaw: number) {
    if (!canSell) return;

    const nextQuantity = Math.max(0, Math.min(Math.floor(Number(nextQuantityRaw || 0)), item.availableStock));
    setCart((current) => current.flatMap((row) => {
      if (row.variantId !== item.variantId || row.fulfillmentStoreId !== item.fulfillmentStoreId) return [row];
      if (nextQuantity <= 0) return [];
      return [{
        ...row,
        quantity: nextQuantity,
        subtotal: nextQuantity * row.unitPrice,
      }];
    }));
  }

  // Quita cantidad de una fila del carrito (usado por el "Deshacer" del toast).
  function removeCartQuantity(variantId: number, storeId: number, qty: number) {
    setCart((current) => current.flatMap((row) => {
      if (row.variantId !== variantId || row.fulfillmentStoreId !== storeId) return [row];
      const nextQty = row.quantity - qty;
      if (nextQty <= 0) return [];
      return [{ ...row, quantity: nextQty, subtotal: nextQty * row.unitPrice }];
    }));
  }

  // Agregado rapido de 1 unidad usando el stock de la tienda actual (para
  // productos SIMPLE o de una sola variante). Si no hay stock local, deriva al
  // selector para revisar otras tiendas.
  function addVariantDirect(product: PosProduct, variant: PosVariant) {
    if (!canSell) {
      showAlert('No tienes permiso para agregar productos al carrito POS.', 'error');
      return;
    }
    if (!selectedStoreId) {
      showAlert('Selecciona una tienda para vender.', 'warning');
      return;
    }

    const localStock = Math.max(0, Number(variant.availableStock || 0));
    if (localStock <= 0) {
      showAlert('Sin stock en esta tienda. Revisa disponibilidad en otras tiendas.', 'warning');
      openVariantSelector(product);
      return;
    }

    const storeId = selectedStoreId;
    const storeName = selectedStoreName;
    const existing = cart.find((row) => row.variantId === variant.id && row.fulfillmentStoreId === storeId);
    if (existing && existing.quantity >= localStock) {
      showAlert('No hay mas stock disponible de este producto en la tienda.', 'warning');
      return;
    }

    setCart((current) => {
      const next = [...current];
      const idx = next.findIndex((row) => row.variantId === variant.id && row.fulfillmentStoreId === storeId);
      if (idx === -1) {
        next.push({
          variantId: variant.id,
          fulfillmentStoreId: storeId,
          fulfillmentStoreName: storeName,
          productId: product.id,
          productName: product.name,
          colorName: variant.colorName,
          sizeName: variant.sizeName,
          sku: variant.sku,
          imageUrl: variant.imageUrl || product.imageUrl,
          unitPrice: variant.price,
          quantity: 1,
          availableStock: localStock,
          subtotal: variant.price,
        });
      } else {
        const row = next[idx];
        const nextQty = Math.min(localStock, row.quantity + 1);
        next[idx] = { ...row, quantity: nextQty, subtotal: nextQty * row.unitPrice, availableStock: localStock };
      }
      return next;
    });

    showAlert(`${product.name} agregado`, 'success', 4000, {
      label: 'Deshacer',
      onClick: () => removeCartQuantity(variant.id, storeId, 1),
    });
  }

  // Punto de entrada al tocar un card: SIMPLE / variante unica -> directo;
  // con variantes reales -> abre el selector adaptativo.
  function handleProductTap(product: PosProduct) {
    if (!canSell) {
      showAlert('No tienes permiso para agregar productos al carrito POS.', 'error');
      return;
    }
    const first = product.variants[0];
    if (!first) {
      showAlert('Este producto no tiene variantes activas.', 'warning');
      return;
    }
    const axes = getProductAxes(product);
    if (product.variants.length === 1 || (!axes.hasColor && !axes.hasSize)) {
      addVariantDirect(product, first);
    } else {
      openVariantSelector(product);
    }
  }

  function addSelectedVariantToCart() {
    if (!canSell) {
      showAlert('No tienes permiso para agregar productos al carrito POS.', 'error');
      return;
    }

    if (!selectedProduct || !selectedVariant) {
      showAlert('Selecciona una variante valida.', 'warning');
      return;
    }

    if (!effectiveFulfillmentStoreId || effectiveVariantStock <= 0) {
      showAlert('Esta variante no tiene stock disponible en la tienda seleccionada ni en tiendas alternativas.', 'error');
      return;
    }

    const quantity = Math.max(1, Math.min(effectiveVariantStock, Math.floor(Number(variantQuantity || 1))));

    setCart((current) => {
      const next = [...current];
      let remaining = quantity;

      const addCartAllocation = (storeId: number | null, storeName: string, availableStock: number) => {
        if (!storeId || remaining <= 0 || availableStock <= 0) return;

        const existingIndex = next.findIndex((row) => (
          row.variantId === selectedVariant.id
          && row.fulfillmentStoreId === storeId
        ));
        const currentQuantity = existingIndex >= 0 ? next[existingIndex].quantity : 0;
        const availableCapacity = Math.max(0, availableStock - currentQuantity);
        const quantityToAdd = Math.min(remaining, availableCapacity);
        if (quantityToAdd <= 0) return;

        if (existingIndex === -1) {
          next.push({
            variantId: selectedVariant.id,
            fulfillmentStoreId: storeId,
            fulfillmentStoreName: storeName,
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            colorName: selectedVariant.colorName,
            sizeName: selectedVariant.sizeName,
            sku: selectedVariant.sku,
            imageUrl: selectedVariant.imageUrl || selectedProduct.imageUrl,
            unitPrice: selectedVariant.price,
            quantity: quantityToAdd,
            availableStock,
            subtotal: quantityToAdd * selectedVariant.price,
          });
        } else {
          const row = next[existingIndex];
          const mergedQty = Math.min(availableStock, row.quantity + quantityToAdd);
          next[existingIndex] = {
            ...row,
            fulfillmentStoreName: storeName,
            availableStock,
            quantity: mergedQty,
            subtotal: mergedQty * row.unitPrice,
          };
        }

        remaining -= quantityToAdd;
      };

      addCartAllocation(selectedStoreId, selectedStoreName, localVariantStock);
      addCartAllocation(selectedRemoteStock?.storeId || null, selectedRemoteStock?.storeName || '', remoteVariantStock);

      return next;
    });

    showAlert('Variante agregada al carrito.', 'success');
    closeVariantSelector();
  }

  function clearCart() {
    if (!canCancelSale) {
      showAlert('No tienes permiso para vaciar o cancelar una venta POS.', 'error');
      return;
    }

    setCart([]);
    setShowMobileCart(false);
  }

  function removeFromCart(variantId: number, fulfillmentStoreId: number) {
    if (!canSell) return;
    setCart((current) => current.filter((item) => (
      item.variantId !== variantId || item.fulfillmentStoreId !== fulfillmentStoreId
    )));
  }

  function openPaymentPanel() {
    if (!canCharge) {
      showAlert('No tienes permiso para cobrar ventas POS.', 'error');
      return;
    }

    if (cart.length === 0) {
      showAlert('El carrito esta vacio.', 'warning');
      return;
    }
    setAmountPaid(total);
    setShowPaymentDrawer(true);
    setShowMobileCart(false);
  }

  function closePaymentPanel() {
    if (submittingPayment) return;
    setShowPaymentDrawer(false);
  }

  function selectCustomer(customer: AdminCustomer) {
    setSelectedCustomerId(customer.id);
    setClientName(customer.name);
    setClientPhone(customer.phone);
    setClientEmail(customer.email);
    setClienteTipoDoc(customer.documentType || '1');
    setClienteNumDoc(customer.documentNumber);
    setClientAddress(customer.address);
    setCustomerQuery('');
    setCustomerResults([]);
    setSaveNewCustomer(false);
  }

  function clearSelectedCustomer() {
    setSelectedCustomerId(null);
    setClientName('');
    setClientPhone('');
    setClientEmail('');
    setClienteTipoDoc('1');
    setClienteNumDoc('');
    setClientAddress('');
    setCustomerQuery('');
    setCustomerResults([]);
    setSaveNewCustomer(false);
  }

  // F3: abre el selector de variante con la variante exacta del codigo escaneado (barcode o SKU)
  function selectByScannedCode(code: string) {
    if (!canSell) {
      showAlert('No tienes permiso para agregar productos al carrito POS.', 'error');
      return;
    }
    const needle = code.trim().toLowerCase();
    if (!needle) return;

    let foundProduct: PosProduct | null = null;
    let foundVariant: PosVariant | null = null;
    for (const product of products) {
      const variant = product.variants.find((candidate) =>
        asText(candidate.barcode).toLowerCase() === needle
        || candidate.sku.toLowerCase() === needle);
      if (variant) {
        foundProduct = product;
        foundVariant = variant;
        break;
      }
    }

    if (!foundProduct || !foundVariant) {
      showAlert(`Sin coincidencia para el codigo ${code}.`, 'warning');
      return;
    }

    setSearchTerm('');
    setSelectedProductId(foundProduct.id);
    setSelectedColor(foundVariant.colorName);
    setSelectedSize(foundVariant.sizeName);
    setRemoteStockOptions([]);
    setSelectedFulfillmentStoreId(null);
    setVariantQuantity(Math.min(1, Math.max(1, foundVariant.availableStock || 1)));
  }

  // F3: atajos de teclado + lector de codigo de barras fisico (rafaga rapida terminada en Enter)
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = 0;

    const isEditable = (node: Element | null) => {
      if (!node) return false;
      const el = node as HTMLElement;
      return el.tagName === 'INPUT'
        || el.tagName === 'TEXTAREA'
        || el.tagName === 'SELECT'
        || el.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // F9 = cobrar
      if (event.key === 'F9') {
        event.preventDefault();
        if (canCharge && cart.length > 0 && !showPaymentDrawer) openPaymentPanel();
        return;
      }

      // Esc = cerrar capas por prioridad
      if (event.key === 'Escape') {
        if (showPaymentDrawer) { closePaymentPanel(); return; }
        if (selectedProductId !== null) { closeVariantSelector(); return; }
        if (showMobileCart) { setShowMobileCart(false); return; }
        return;
      }

      const editing = isEditable(document.activeElement);

      // "/" enfoca la busqueda (si no se esta escribiendo en un campo)
      if (event.key === '/' && !editing) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // Lector de codigo de barras: solo con el foco fuera de campos editables
      if (editing) { buffer = ''; return; }

      const now = Date.now();
      if (now - lastKeyTime > 80) buffer = '';
      lastKeyTime = now;

      if (event.key === 'Enter') {
        const code = buffer.trim();
        buffer = '';
        if (code.length >= 3) {
          event.preventDefault();
          selectByScannedCode(code);
        }
        return;
      }

      if (event.key.length === 1) {
        buffer += event.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCharge, cart, total, products, showPaymentDrawer, selectedProductId, showMobileCart, canSell]);

  async function validateCartStockSnapshot(): Promise<boolean> {
    const requestedByStoreAndVariant = new Map<string, {
      storeId: number;
      variantId: number;
      productName: string;
      storeName: string;
      quantity: number;
    }>();

    cart.forEach((item) => {
      const key = `${item.fulfillmentStoreId}:${item.variantId}`;
      const current = requestedByStoreAndVariant.get(key);
      requestedByStoreAndVariant.set(key, {
        storeId: item.fulfillmentStoreId,
        variantId: item.variantId,
        productName: item.productName,
        storeName: item.fulfillmentStoreName,
        quantity: (current?.quantity || 0) + item.quantity,
      });
    });

    const requestsByStore = new Map<number, Array<{
      variantId: number;
      productName: string;
      storeName: string;
      quantity: number;
    }>>();

    requestedByStoreAndVariant.forEach((request) => {
      const bucket = requestsByStore.get(request.storeId) || [];
      bucket.push({
        variantId: request.variantId,
        productName: request.productName,
        storeName: request.storeName,
        quantity: request.quantity,
      });
      requestsByStore.set(request.storeId, bucket);
    });

    for (const [storeId, requests] of requestsByStore.entries()) {
      const params = new URLSearchParams({
        storeId: String(storeId),
        variantIds: requests.map((request) => request.variantId).join(','),
      });
      const response = await fetch(`/api/admin/orders/variant-stock?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      }).catch(() => null);

      if (!response) {
        showAlert('No se pudo validar el stock actual antes del cobro.', 'error');
        return false;
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { error?: unknown; message?: unknown } | null)?.error
            || (payload as { error?: unknown; message?: unknown } | null)?.message
            || 'No se pudo validar el stock actual antes del cobro.'),
          'error',
        );
        return false;
      }

      const stockByVariant = new Map(
        normalizeVariantStockResponse(payload).map((row) => [row.variantId, row])
      );

      for (const request of requests) {
        const availableStock = Math.max(0, Number(stockByVariant.get(request.variantId)?.availableStock || 0));
        if (availableStock < request.quantity) {
          showAlert(
            `Stock insuficiente para ${request.productName} en ${request.storeName}. Solicitado: ${request.quantity}. Disponible: ${availableStock}.`,
            'error',
          );
          return false;
        }
      }
    }

    return true;
  }

  async function submitPayment() {
    if (!canCharge) {
      showAlert('No tienes permiso para cobrar ventas POS.', 'error');
      return;
    }

    if (submittingPayment) return;
    if (!selectedStoreId) {
      showAlert('Selecciona una tienda para continuar.', 'warning');
      return;
    }
    if (cart.length === 0) {
      showAlert('Agrega items al carrito antes de cobrar.', 'warning');
      return;
    }
    if (selectedPaymentMethod === 'Efectivo' && amountPaid < total) {
      showAlert('El monto pagado no cubre el total.', 'error');
      return;
    }
    if (docType === 'FACTURA') {
      if (clienteTipoDoc !== '6' || !/^\d{11}$/.test(asText(clienteNumDoc))) {
        showAlert('Para emitir Factura ingresa un RUC valido (11 digitos).', 'warning');
        return;
      }
      if (!asText(clientName)) {
        showAlert('Para emitir Factura ingresa la razon social del cliente.', 'warning');
        return;
      }
    }
    if (saveNewCustomer && !selectedCustomerId && asText(clientName).length < 2) {
      showAlert('Ingresa el nombre del cliente que deseas guardar.', 'warning');
      return;
    }

    setSubmittingPayment(true);
    try {
      const hasCurrentStock = await validateCartStockSnapshot();
      if (!hasCurrentStock) {
        return;
      }

      let orderCustomerId = selectedCustomerId;
      if (!orderCustomerId && saveNewCustomer) {
        const customerResponse = await fetch('/api/admin/customers', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: asText(clientName),
            documentType: asText(clienteNumDoc) ? clienteTipoDoc : undefined,
            documentNumber: asText(clienteNumDoc) || undefined,
            email: asText(clientEmail) || undefined,
            phone: asText(clientPhone) || undefined,
            address: asText(clientAddress) || undefined,
          }),
        });
        const customerPayload = await customerResponse.json().catch(() => null);
        if (!customerResponse.ok) {
          showAlert(String((customerPayload as { message?: unknown } | null)?.message || 'No se pudo registrar el cliente.'), 'error');
          return;
        }
        orderCustomerId = normalizeCustomer(customerPayload)?.id || null;
        if (!orderCustomerId) {
          showAlert('El cliente fue registrado, pero no se pudo vincular a la venta.', 'error');
          return;
        }
      }

      // Genera la clave solo la primera vez; los reintentos del mismo cobro la reusan.
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      const paymentReference = `POS-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const remoteFulfillmentStores = Array.from(new Map(
        cart
          .filter((item) => item.fulfillmentStoreId !== selectedStoreId)
          .map((item) => [item.fulfillmentStoreId, item.fulfillmentStoreName])
      ).values());
      const fulfillmentNote = remoteFulfillmentStores.length > 0
        ? `Reservas remotas generadas en tiendas: ${remoteFulfillmentStores.join(', ')}`
        : '';
      const response = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          salesChannel: 'POS',
          sourceStoreId: selectedStoreId,
          idempotencyKey: idempotencyKeyRef.current,
          applyIgv,
          customerId: orderCustomerId || undefined,
          clientName: asText(clientName, 'Cliente POS'),
          clientEmail: asText(clientEmail) || undefined,
          clientPhone: asText(clientPhone) || undefined,
          clienteTipoDoc: asText(clienteNumDoc) ? clienteTipoDoc : undefined,
          clienteNumDoc: asText(clienteNumDoc) || undefined,
          comprobanteTipo: docType === 'NOTA' ? undefined : docType,
          note: buildOrderNote([orderNote, fulfillmentNote].filter(Boolean).join(' | '), selectedPaymentMethod, paymentReference, amountPaid, change, clientAddress),
          items: cart.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            fulfillmentStoreId: item.fulfillmentStoreId,
          })),
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { error?: unknown; message?: unknown } | null)?.error
            || (payload as { error?: unknown; message?: unknown } | null)?.message
            || 'No se pudo registrar la venta.'),
          'error',
        );
        return;
      }

      const createdOrder = (payload as { data?: { code?: unknown; id?: unknown } }).data || {};
      const code = asText(createdOrder.code, 'VENTA');
      const createdId = Number(createdOrder.id) || 0;
      const orderData = (payload as { data?: { comprobante?: { serie?: unknown; numero?: unknown; tipo?: unknown; estado?: unknown }; comprobanteError?: unknown } }).data;
      const comprobanteInfo = orderData?.comprobante;
      showAlert(`Venta creada: ${code}`, 'success', 4200);
      if (comprobanteInfo?.serie) {
        const label = `${asText(comprobanteInfo.serie)}-${asText(comprobanteInfo.numero)}`;
        showAlert(`${asText(comprobanteInfo.tipo) === 'FACTURA' ? 'Factura' : 'Boleta'} ${label} generada.`, 'success', 5000);
      } else if (docType !== 'NOTA') {
        // Se pidio comprobante pero no se emitio: la venta quedo registrada. Avisar para
        // que el operador lo reintente desde Comprobantes (no es un fallo silencioso).
        const motivo = asText(orderData?.comprobanteError);
        showAlert(
          `Venta OK, pero el comprobante (${POS_DOC_TYPE_LABELS[docType]}) NO se emitio${motivo ? `: ${motivo}` : ''}. Reintenta desde Comprobantes.`,
          'error',
          8000,
        );
      }
      if (createdId > 0) {
        setPendingPrint({ id: createdId, code });
      }
      // Venta confirmada: la proxima venta usara una clave nueva.
      idempotencyKeyRef.current = null;
      setCart([]);
      setShowPaymentDrawer(false);
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setClienteNumDoc('');
      setClienteTipoDoc('1');
      setClientAddress('');
      setSelectedCustomerId(null);
      setCustomerQuery('');
      setCustomerResults([]);
      setSaveNewCustomer(false);
      setOrderNote('');
      setAmountPaid(0);
      loadSalesHistory(selectedStoreId);
      loadStoreStock(selectedStoreId, productsBase);
    } catch {
      showAlert('No se pudo registrar la venta.', 'error');
    } finally {
      setSubmittingPayment(false);
    }
  }

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card admin-pos-header-next">
        <div className="admin-pos-store-heading-next">
          <h1>Punto de venta</h1>
          <span className="admin-pos-online-status-next">Conectado</span>
        </div>
        <div className="admin-pos-header-actions-next">
          <Link href="/admin/orders/list" className="admin-ghost-btn">Gestion de ordenes</Link>
          <button type="button" className="admin-ghost-btn" onClick={() => setShowSalesHistory(true)}>
            Historial ({salesHistory.length})
          </button>
        </div>
      </article>

      <nav className="admin-card admin-pos-mobile-actions-next" aria-label="Acciones del punto de venta">
        <Link href="/admin/orders/list" className="admin-ghost-btn">Gestion de ordenes</Link>
        <button type="button" className="admin-ghost-btn" onClick={() => setShowSalesHistory(true)}>
          Historial ({salesHistory.length})
        </button>
      </nav>

      <section className="admin-pos-layout-next">
        <article className="admin-card admin-pos-catalog-next">
          <div className="admin-pos-toolbar-next">
            <input
              ref={searchInputRef}
              type="text"
              className="admin-pos-search-input-next"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && filteredProducts.length === 1) {
                  event.preventDefault();
                  handleProductTap(filteredProducts[0]);
                } else if (event.key === 'Escape') {
                  event.currentTarget.blur();
                }
              }}
              placeholder="Buscar por nombre, SKU, color o talla"
            />

            <button
              type="button"
              className="admin-pos-scan-btn-next"
              aria-label="Escanear codigo"
              onClick={() => showAlert('Escaneo por camara pendiente por implementar.', 'info')}
            >
              #
            </button>

            <label className="admin-pos-store-selector-next">
              <span>Tienda</span>
              <AdminSelect
                value={selectedStoreId ? String(selectedStoreId) : ''}
                ariaLabel="Tienda"
                onChange={(value) => {
                  const nextStoreId = asPositiveInt(value);
                  setSelectedStoreId(nextStoreId);
                  setCart([]);
                }}
                options={[
                  { value: '', label: 'Selecciona' },
                  ...stores.map((store) => ({ value: String(store.id), label: store.name })),
                ]}
              />
            </label>
          </div>

          <div className="admin-pos-categories-next">
            {categoryOptions.map((category) => (
              <button
                key={category}
                type="button"
                className={`admin-pos-category-btn-next ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <p className="admin-pos-products-info-next">
            {loadingProducts ? 'Cargando productos...' : `${filteredProducts.length} producto(s) visibles`}
            {loadingStock ? ' - actualizando stock...' : ''}
          </p>
          {!canSell ? <p className="admin-muted-text">Sin permiso pos.sell: solo lectura del catalogo.</p> : null}

          {loadingProducts ? (
            <p className="admin-muted-text">Cargando catalogo POS...</p>
          ) : filteredProducts.length === 0 ? (
            <p className="admin-muted-text">No hay productos para los filtros aplicados.</p>
          ) : (
            <div className="admin-pos-products-grid-next">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="admin-pos-product-card-next"
                  disabled={!canSell}
                  onClick={() => handleProductTap(product)}
                >
                  <div className="admin-pos-product-image-next">
                    {product.imageUrl ? (
                      <Image src={product.imageUrl} alt={product.name} fill sizes="150px" style={{ objectFit: 'cover' }} />
                    ) : (
                      <span>Sin imagen</span>
                    )}
                  </div>
                  <div className="admin-pos-product-body-next">
                    <h4>{product.name}</h4>
                    <p className="admin-pos-product-sku-next">{product.variants[0]?.sku || 'Sin SKU'}</p>
                    <div className="admin-pos-product-badges-next">
                      <span className="admin-pos-badge-next admin-pos-badge-price-next">{formatCurrency(product.minPrice)}</span>
                      <span className="admin-pos-badge-next admin-pos-badge-stock-next">{getStockChip(product)}</span>
                      <span className="admin-pos-badge-next admin-pos-badge-type-next">
                        {product.variants.length <= 1 ? 'Único' : `${product.variants.length} var.`}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </article>

        <aside id="admin-pos-cart" className={`admin-card admin-pos-cart-next ${showMobileCart ? 'mobile-open' : ''}`}>
          <div className="admin-pos-cart-head-next">
            <h2>Carrito</h2>
            <div className="admin-pos-cart-head-actions-next">
              <button type="button" className="admin-ghost-btn admin-pos-close-mobile-cart-next" onClick={() => setShowMobileCart(false)}>
                Cerrar
              </button>
              <button
                type="button"
                className="admin-pos-danger-btn-next"
                disabled={cart.length === 0 || !canCancelSale}
                onClick={clearCart}
              >
                Vaciar
              </button>
            </div>
          </div>

          {cart.length === 0 ? (
            <div className="admin-pos-empty-cart-next">Agrega productos para comenzar una venta.</div>
          ) : (
            <div className="admin-pos-cart-items-next">
              {cart.map((item) => (
                <article key={`${item.variantId}-${item.fulfillmentStoreId}`} className="admin-pos-cart-item-next">
                  <div className="admin-pos-cart-item-image-next">
                    {item.imageUrl ? <Image src={item.imageUrl} alt={item.productName} fill sizes="50px" style={{ objectFit: 'cover' }} /> : <span>N/A</span>}
                  </div>
                  <div className="admin-pos-cart-item-main-next">
                    <h5>{item.productName}</h5>
                    <p className="admin-pos-item-variant-next">{item.colorName} / {item.sizeName}</p>
                    {item.fulfillmentStoreId !== selectedStoreId ? (
                      <p className="admin-pos-item-store-next">Reserva: {item.fulfillmentStoreName}</p>
                    ) : null}
                    <p className="admin-pos-item-price-next">{formatCurrency(item.unitPrice)}</p>
                  </div>
                  <div className="admin-pos-item-quantity-next">
                    <div className="admin-pos-qty-next">
                      <button type="button" disabled={!canSell} onClick={() => updateCartQuantity(item, item.quantity - 1)}>-</button>
                      <input
                        type="number"
                        min={0}
                        max={item.availableStock}
                        value={item.quantity}
                        disabled={!canSell}
                        onChange={(event) => updateCartQuantity(item, Number(event.target.value))}
                      />
                      <button type="button" disabled={!canSell} onClick={() => updateCartQuantity(item, item.quantity + 1)}>+</button>
                    </div>
                  </div>
                  <div className="admin-pos-item-subtotal-next">
                    <span>{formatCurrency(item.subtotal)}</span>
                    <button
                      type="button"
                      className="admin-pos-remove-btn-next"
                      disabled={!canSell}
                      onClick={() => removeFromCart(item.variantId, item.fulfillmentStoreId)}
                      aria-label={`Quitar ${item.productName}`}
                    >
                      x
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="admin-pos-cart-summary-next">
            <div className="summary-line">
              <span>Subtotal</span>
              <strong>{formatCurrency(subtotal)}</strong>
            </div>
            <label className="admin-checkbox">
              <input type="checkbox" checked={applyIgv} onChange={(event) => setApplyIgv(event.target.checked)} />
              Aplicar IGV (18%)
            </label>
            <div className="summary-line">
              <span>{applyIgv ? 'IGV' : 'IGV (no incluido)'}</span>
              <strong>{formatCurrency(tax)}</strong>
            </div>
            <div className="summary-line total">
              <span>Total</span>
              <strong>{formatCurrency(total)}</strong>
            </div>

            <button
              type="button"
              className="admin-primary-btn admin-pos-checkout-btn-next"
              disabled={cart.length === 0 || !canCharge}
              onClick={openPaymentPanel}
            >
              Cobrar
              <kbd>F9</kbd>
            </button>
            <button
              type="button"
              className="admin-pos-review-btn-next"
              disabled={cart.length === 0 || !canCharge}
              onClick={openPaymentPanel}
            >
              Revisar pago
            </button>
            <button
              type="button"
              className="admin-pos-danger-btn-next"
              disabled={cart.length === 0 || !canCancelSale}
              onClick={clearCart}
            >
              Limpiar carrito
            </button>
            {!canCharge ? <p className="admin-muted-text">Sin permiso pos.charge para finalizar cobros.</p> : null}
          </div>
        </aside>
      </section>

      <button
        type="button"
        className="admin-pos-mobile-trigger-next"
        onClick={() => setShowMobileCart((value) => !value)}
        aria-controls="admin-pos-cart"
        aria-expanded={showMobileCart}
      >
        <span className="admin-pos-mobile-trigger-meta-next">
          <strong>{cartItemsCount} item(s)</strong>
          <small>Total {formatCurrency(total)}</small>
        </span>
        <span className="admin-pos-mobile-trigger-action-next">{showMobileCart ? 'Cerrar' : 'Ver carrito'}</span>
      </button>

      {showMobileCart ? <div className="admin-pos-mobile-backdrop-next" onClick={() => setShowMobileCart(false)} /> : null}

      {selectedProduct && selectedVariant ? (
        <div className="admin-modal-overlay inventory-drawer-overlay" onClick={closeVariantSelector}>
          <aside className="admin-pos-variant-drawer-next" onClick={(event) => event.stopPropagation()}>
            <div className="admin-pos-drawer-head-next">
              <div>
                <h3>Seleccionar variante</h3>
                <p>{selectedProduct.name}</p>
              </div>
              <button
                type="button"
                className="admin-pos-drawer-close-next"
                onClick={closeVariantSelector}
                aria-label="Cerrar selector de variante"
              >
                x
              </button>
            </div>

            <div className="admin-pos-drawer-body-next">
              <div className="admin-pos-drawer-product-head-next">
                <div>
                  <h4>{selectedProduct.name}</h4>
                  <p className="admin-pos-drawer-sku-next">{selectedVariant.sku}</p>
                </div>
                <div className="admin-pos-drawer-price-next">
                  <span>Precio</span>
                  <strong>{formatCurrency(selectedVariant.price)}</strong>
                </div>
              </div>

              <div className="admin-pos-variant-image-next">
                {(selectedVariant.imageUrl || selectedProduct.imageUrl) ? (
                  <Image src={selectedVariant.imageUrl || selectedProduct.imageUrl || ''} alt={selectedProduct.name} fill sizes="92px" style={{ objectFit: 'cover' }} />
                ) : (
                  <span>Sin imagen</span>
                )}
              </div>

              {selectedProductAxes.hasColor ? (
              <div className="admin-pos-variant-section-next">
                <label>Color</label>
                <div className="admin-pos-color-selector-next">
                  {colorOptions.map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      className={`admin-pos-color-btn-next ${selectedColor === color.name ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedColor(color.name);
                        const firstVariant = selectedProduct.variants.find((variant) => variant.colorName === color.name);
                        setSelectedSize(firstVariant?.sizeName || '');
                      }}
                    >
                      <i style={{ background: color.hex || '#cbd5e1' }} />
                      <span>{color.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              ) : null}

              {selectedProductAxes.hasSize ? (
              <div className="admin-pos-variant-section-next">
                <label>Talla</label>
                <div className="admin-pos-size-selector-next">
                  {sizeOptions.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      className={`admin-pos-size-btn-next ${selectedVariant.id === variant.id ? 'active' : ''} ${variant.availableStock === 0 ? 'no-stock' : ''}`}
                      onClick={() => {
                        setSelectedSize(variant.sizeName);
                        setSelectedColor(variant.colorName);
                      }}
                    >
                      <span>{variant.sizeName}</span>
                      <small>{variant.availableStock} disp.</small>
                    </button>
                  ))}
                </div>
              </div>
              ) : null}

              <div className="admin-pos-stock-info-next">
                <p>
                  Stock en {selectedStoreName}: {selectedVariant.availableStock} disponible(s)
                </p>
                {selectedRemoteStock ? (
                  <p>Recomendacion: {selectedRemoteStock.storeName} tiene {selectedRemoteStock.availableStock} disponible(s)</p>
                ) : null}
                {localVariantStock > 0 && selectedRemoteStock ? (
                  <p>Total combinando tiendas: {effectiveVariantStock} disponible(s)</p>
                ) : null}
              </div>

              {shouldSuggestRemoteStock ? (
                <div className="admin-pos-remote-stock-next">
                  <div className="admin-pos-remote-stock-head-next">
                    <strong>{localVariantStock > 0 ? 'Recomendacion en otras tiendas' : 'Disponible en otras tiendas'}</strong>
                    {loadingRemoteStock ? <span>Buscando...</span> : null}
                  </div>
                  {loadingRemoteStock ? (
                    <p className="admin-muted-text">Consultando stock multitienda...</p>
                  ) : remoteStockOptions.length === 0 ? (
                    <p className="admin-muted-text">No hay stock disponible en otras tiendas para esta variante.</p>
                  ) : (
                    <div className="admin-pos-remote-store-list-next">
                      {remoteStockOptions.map((option) => (
                        <button
                          key={option.storeId}
                          type="button"
                          className={`admin-pos-remote-store-btn-next ${selectedFulfillmentStoreId === option.storeId ? 'active' : ''}`}
                          onClick={() => setSelectedFulfillmentStoreId(option.storeId)}
                        >
                          <span>{option.storeName}</span>
                          <strong>{option.availableStock} disp.</strong>
                        </button>
                      ))}
                    </div>
                  )}
                  {localVariantStock > 0 && selectedRemoteStock ? (
                    <p className="admin-pos-remote-stock-note-next">
                      Si la cantidad supera el stock local, el faltante se reservara en la tienda recomendada.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="admin-pos-variant-section-next">
                <label htmlFor="posVariantQuantity">Cantidad</label>
                <div className="admin-pos-quantity-selector-next">
                  <button
                    type="button"
                    onClick={() => {
                      const max = Math.max(1, effectiveVariantStock);
                      setVariantQuantity((current) => Math.max(1, Math.min(max, current - 1)));
                    }}
                  >
                    -
                  </button>
                  <input
                    id="posVariantQuantity"
                    type="number"
                    min={1}
                    max={Math.max(1, effectiveVariantStock)}
                    value={variantQuantity}
                    onChange={(event) => {
                      const next = Math.floor(Number(event.target.value || 1));
                      const safe = Math.max(1, Math.min(Math.max(1, effectiveVariantStock), next));
                      setVariantQuantity(safe);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const max = Math.max(1, effectiveVariantStock);
                      setVariantQuantity((current) => Math.max(1, Math.min(max, current + 1)));
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="admin-pos-drawer-footer-next">
              <button
                type="button"
                className="admin-pos-drawer-primary-btn-next"
                disabled={!canSell || effectiveVariantStock <= 0 || !effectiveFulfillmentStoreId}
                onClick={addSelectedVariantToCart}
              >
                Agregar al carrito
              </button>
              <button type="button" className="admin-pos-drawer-secondary-btn-next" onClick={closeVariantSelector}>
                Cancelar
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {showPaymentDrawer ? (
        <div className="admin-modal-overlay inventory-drawer-overlay" onClick={closePaymentPanel}>
          <aside className="admin-pos-payment-drawer-next" onClick={(event) => event.stopPropagation()}>
            <div className="admin-pos-drawer-head-next">
              <div>
                <h3>Cobrar venta</h3>
                <p>Completa datos y confirma el pago.</p>
              </div>
              <button
                type="button"
                className="admin-pos-drawer-close-next"
                onClick={closePaymentPanel}
                aria-label="Cerrar cobro POS"
              >
                x
              </button>
            </div>

            <div className="admin-pos-drawer-body-next">
              {/* Pago al frente: lo unico imprescindible para cerrar la venta. */}
              <div className="admin-pos-payment-methods-next">
                {paymentMethods.map((method) => (
                  <button
                    key={method}
                    type="button"
                    className={selectedPaymentMethod === method ? 'active' : ''}
                    onClick={() => {
                      setSelectedPaymentMethod(method);
                      if (method !== 'Efectivo') {
                        setAmountPaid(total);
                      }
                    }}
                  >
                    {method}
                  </button>
                ))}
              </div>

              <div className="admin-pos-payment-summary-next">
                <label className="admin-pos-igv-toggle-group-next">
                  <span>Aplicar IGV en esta venta</span>
                  <input type="checkbox" checked={applyIgv} onChange={(event) => setApplyIgv(event.target.checked)} />
                </label>

                <div className="summary-line">
                  <span>Total a cobrar</span>
                  <div className="admin-pos-payment-amount-next">{formatCurrency(total)}</div>
                </div>

                {selectedPaymentMethod === 'Efectivo' ? (
                  <label className="admin-pos-form-group-next">
                    <span>Monto pagado</span>
                    <input
                      className="admin-pos-form-input-next"
                      type="number"
                      min={0}
                      value={amountPaid}
                      onChange={(event) => setAmountPaid(Math.max(0, Number(event.target.value) || 0))}
                    />
                  </label>
                ) : null}

                <div className="summary-line">
                  <span>Vuelto</span>
                  <div className="admin-pos-payment-change-next">{formatCurrency(change)}</div>
                </div>
              </div>

              {/* Comprobante: la mayoria de ventas mostrador usan el default. */}
              <details className="admin-pos-collapse-next">
                <summary>Comprobante <span className="admin-pos-collapse-value-next">{POS_DOC_TYPE_LABELS[docType]}</span></summary>
                <div className="admin-pos-doc-type-next">
                  <AdminSelect
                    ariaLabel="Tipo de comprobante"
                    value={docType}
                    options={docTypeOptions}
                    onChange={updateDocType}
                  />
                  {!boletaEnabled && !facturaEnabled ? (
                    <small className="admin-pos-doc-type-hint-next">
                      Habilita Boleta y Factura en Configuracion.
                    </small>
                  ) : null}
                </div>
              </details>

              {/* Datos del cliente: opcionales, colapsados por defecto. */}
              <details className="admin-pos-collapse-next">
                <summary>Datos del cliente <span className="admin-pos-collapse-value-next">{selectedCustomerId ? clientName : 'opcional'}</span></summary>
                {canViewCustomers ? (
                  <div className="admin-pos-customer-search-next">
                    {selectedCustomerId ? (
                      <div className="admin-pos-customer-selected-next">
                        <div><strong>{clientName}</strong><small>Cliente registrado vinculado a esta venta</small></div>
                        <button type="button" className="admin-ghost-btn" onClick={clearSelectedCustomer}>Cambiar</button>
                      </div>
                    ) : (
                      <label className="admin-pos-form-group-next admin-pos-customer-query-next">
                        <span>Buscar cliente existente</span>
                        <input
                          className="admin-pos-form-input-next" type="search" autoComplete="off"
                          value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)}
                          placeholder="Escribe nombre o DNI"
                        />
                        {searchingCustomers ? <small>Buscando...</small> : null}
                        {customerQuery.trim().length >= 2 && !searchingCustomers ? (
                          <div className="admin-pos-customer-results-next" role="listbox">
                            {customerResults.length > 0 ? customerResults.map((customer) => (
                              <button type="button" role="option" aria-selected="false" key={customer.id} onClick={() => selectCustomer(customer)}>
                                <strong>{customer.name}</strong>
                                <span>{customerDocumentLabel(customer)}{customer.phone ? ` · ${customer.phone}` : ''}</span>
                              </button>
                            )) : <p>No se encontraron clientes. Puedes completar los datos y guardarlo.</p>}
                          </div>
                        ) : null}
                      </label>
                    )}
                  </div>
                ) : null}
                <div className="admin-pos-payment-grid-next">
                  <label className="admin-pos-form-group-next">
                    <span>Cliente</span>
                    <input
                      className="admin-pos-form-input-next"
                      type="text"
                      value={clientName}
                      onChange={(event) => setClientName(event.target.value)}
                      placeholder="Cliente POS"
                    />
                  </label>
                  <label className="admin-pos-form-group-next">
                    <span>Telefono</span>
                    <input
                      className="admin-pos-form-input-next"
                      type="text"
                      value={clientPhone}
                      onChange={(event) => setClientPhone(event.target.value)}
                      placeholder="Opcional"
                    />
                  </label>
                  <label className="admin-pos-form-group-next">
                    <span>Email</span>
                    <input
                      className="admin-pos-form-input-next"
                      type="email"
                      value={clientEmail}
                      onChange={(event) => setClientEmail(event.target.value)}
                      placeholder="Opcional"
                    />
                  </label>
                  <label className="admin-pos-form-group-next">
                    <span>Tipo doc.</span>
                    <AdminSelect
                      value={clienteTipoDoc}
                      ariaLabel="Tipo de documento"
                      onChange={(value) => setClienteTipoDoc(value)}
                      options={[
                        { value: '1', label: 'DNI' },
                        { value: '6', label: 'RUC' },
                      ]}
                    />
                  </label>
                  <label className="admin-pos-form-group-next">
                    <span>N° documento</span>
                    <input
                      className="admin-pos-form-input-next"
                      type="text"
                      inputMode="numeric"
                      value={clienteNumDoc}
                      onChange={(event) => setClienteNumDoc(event.target.value.replace(/\D/g, ''))}
                      placeholder={clienteTipoDoc === '6' ? 'RUC (11 digitos)' : 'DNI (8 digitos)'}
                      maxLength={clienteTipoDoc === '6' ? 11 : 8}
                    />
                  </label>
                  <label className="admin-pos-form-group-next">
                    <span>Direccion</span>
                    <input
                      className="admin-pos-form-input-next"
                      type="text"
                      value={clientAddress}
                      onChange={(event) => setClientAddress(event.target.value)}
                      placeholder="Opcional"
                    />
                  </label>
                  <label className="admin-pos-form-group-next">
                    <span>Nota</span>
                    <input
                      className="admin-pos-form-input-next"
                      type="text"
                      value={orderNote}
                      onChange={(event) => setOrderNote(event.target.value)}
                      placeholder="Referencia interna"
                    />
                  </label>
                  {!selectedCustomerId && canManageCustomers ? (
                    <label className="admin-checkbox admin-pos-save-customer-next">
                      <input type="checkbox" checked={saveNewCustomer} onChange={(event) => setSaveNewCustomer(event.target.checked)} />
                      Guardar este cliente en el registro al confirmar la venta
                    </label>
                  ) : null}
                </div>
              </details>
            </div>

            <div className="admin-pos-drawer-footer-next">
              <button
                type="button"
                className="admin-pos-drawer-primary-btn-next"
                disabled={!canCharge || submittingPayment}
                onClick={submitPayment}
              >
                {submittingPayment ? 'Procesando...' : 'Confirmar pago'}
              </button>
              <button
                type="button"
                className="admin-pos-drawer-secondary-btn-next"
                disabled={submittingPayment}
                onClick={closePaymentPanel}
              >
                Cancelar
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {pendingPrint ? (
        <div className="admin-modal-overlay" onClick={() => setPendingPrint(null)}>
          <article className="admin-pos-print-prompt-next" onClick={(event) => event.stopPropagation()}>
            <h3>Venta {pendingPrint.code} registrada</h3>
            <p>Deseas imprimir el comprobante ({POS_DOC_TYPE_LABELS[docType]})?</p>
            <div className="admin-pos-print-prompt-actions-next">
              <button
                type="button"
                className="admin-pos-drawer-primary-btn-next"
                onClick={() => {
                  const target = pendingPrint;
                  setPendingPrint(null);
                  if (target) {
                    window.open(`/admin/orders/${target.id}?print=1&doc=${docType}`, '_blank', 'noopener');
                  }
                }}
              >
                Imprimir
              </button>
              <button
                type="button"
                className="admin-pos-drawer-secondary-btn-next"
                onClick={() => setPendingPrint(null)}
              >
                No, gracias
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {showSalesHistory ? (
        <div className="admin-modal-overlay" onClick={() => setShowSalesHistory(false)}>
          <article className="admin-pos-history-modal-next" onClick={(event) => event.stopPropagation()}>
            <div className="admin-pos-history-head-next">
              <h3>Historial de ventas POS</h3>
              <button
                type="button"
                className="admin-modal-close-next"
                onClick={() => setShowSalesHistory(false)}
                aria-label="Cerrar historial POS"
              >
                x
              </button>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table mobile-card-table">
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Cliente</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingSalesHistory ? (
                    <tr>
                      <td colSpan={5} data-label="Estado">Cargando historial...</td>
                    </tr>
                  ) : salesHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} data-label="Estado">No hay ventas recientes.</td>
                    </tr>
                  ) : (
                    salesHistory.map((order) => (
                      <tr key={order.id}>
                        <td data-label="Codigo">{order.code}</td>
                        <td data-label="Cliente">{order.clientName || order.clientEmail || 'Sin cliente'}</td>
                        <td data-label="Total">{formatCurrency(order.total)}</td>
                        <td data-label="Estado">{order.status}</td>
                        <td data-label="Fecha">{formatDateTime(order.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
