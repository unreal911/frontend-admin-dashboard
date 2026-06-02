'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { useAdminUi } from '@/components/admin-ui-provider';
import {
  AdminOrder,
  normalizeOrdersListResponse,
  normalizeVariantStockResponse,
} from '@/lib/admin-order-types';

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

interface PosProduct {
  id: number;
  name: string;
  categoryName: string;
  imageUrl?: string | null;
  variants: PosVariant[];
  minPrice: number;
  totalAvailableStock: number;
  totalReservedStock: number;
}

interface PosCartItem {
  variantId: number;
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

      return {
        id,
        name: asText(raw.name, `Producto #${id}`),
        categoryName: asText(categoryRaw?.name, 'Sin categoria'),
        imageUrl: productImage,
        variants,
        minPrice: Number.isFinite(minPrice) ? minPrice : 0,
        totalAvailableStock: 0,
        totalReservedStock: 0,
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
): string {
  const parts = [
    asText(baseNote),
    `Metodo de pago: ${paymentMethod}`,
    `Ref: ${reference}`,
    Number.isFinite(paidAmount) ? `Monto recibido: ${Number(paidAmount).toFixed(2)}` : '',
    Number.isFinite(changeAmount) ? `Vuelto: ${Number(changeAmount).toFixed(2)}` : '',
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

  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [applyIgv, setApplyIgv] = useState(false);
  const [showMobileCart, setShowMobileCart] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [variantQuantity, setVariantQuantity] = useState(1);

  const [paymentMethods, setPaymentMethods] = useState<string[]>(DEFAULT_PAYMENT_METHODS);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(DEFAULT_PAYMENT_METHODS[0]);
  const [showPaymentDrawer, setShowPaymentDrawer] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [amountPaid, setAmountPaid] = useState(0);

  const [salesHistory, setSalesHistory] = useState<AdminOrder[]>([]);
  const [loadingSalesHistory, setLoadingSalesHistory] = useState(false);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const canSell = hasPermission('pos.sell');
  const canCharge = hasPermission('pos.charge');
  const canCancelSale = hasPermission('pos.cancel_sale');

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

  useEffect(() => {
    loadStores();
    loadProducts();
    loadPaymentMethods();
  }, [loadStores, loadProducts, loadPaymentMethods]);

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
    setVariantQuantity((current) => {
      const safe = Math.floor(Number(current || 1));
      const max = Math.max(1, selectedVariant.availableStock);
      return Math.max(1, Math.min(max, safe));
    });
  }, [selectedProduct, selectedVariant]);

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
    setVariantQuantity(Math.min(1, Math.max(1, firstVariant.availableStock || 1)));
  }

  function closeVariantSelector() {
    setSelectedProductId(null);
    setSelectedColor('');
    setSelectedSize('');
    setVariantQuantity(1);
  }

  function updateCartQuantity(item: PosCartItem, nextQuantityRaw: number) {
    if (!canSell) return;

    const nextQuantity = Math.max(0, Math.min(Math.floor(Number(nextQuantityRaw || 0)), item.availableStock));
    setCart((current) => current.flatMap((row) => {
      if (row.variantId !== item.variantId) return [row];
      if (nextQuantity <= 0) return [];
      return [{
        ...row,
        quantity: nextQuantity,
        subtotal: nextQuantity * row.unitPrice,
      }];
    }));
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

    if (selectedVariant.availableStock <= 0) {
      showAlert('Esta variante no tiene stock disponible en la tienda seleccionada.', 'error');
      return;
    }

    const quantity = Math.max(1, Math.min(selectedVariant.availableStock, Math.floor(Number(variantQuantity || 1))));

    setCart((current) => {
      const existingIndex = current.findIndex((row) => row.variantId === selectedVariant.id);
      if (existingIndex === -1) {
        return [
          ...current,
          {
            variantId: selectedVariant.id,
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            colorName: selectedVariant.colorName,
            sizeName: selectedVariant.sizeName,
            sku: selectedVariant.sku,
            imageUrl: selectedVariant.imageUrl || selectedProduct.imageUrl,
            unitPrice: selectedVariant.price,
            quantity,
            availableStock: selectedVariant.availableStock,
            subtotal: quantity * selectedVariant.price,
          },
        ];
      }

      const next = [...current];
      const row = next[existingIndex];
      const mergedQty = Math.min(row.availableStock, row.quantity + quantity);
      next[existingIndex] = {
        ...row,
        quantity: mergedQty,
        subtotal: mergedQty * row.unitPrice,
      };
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

  function removeFromCart(variantId: number) {
    if (!canSell) return;
    setCart((current) => current.filter((item) => item.variantId !== variantId));
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

    setSubmittingPayment(true);
    try {
      const paymentReference = `POS-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const response = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sourceStoreId: selectedStoreId,
          fulfillmentStoreId: selectedStoreId,
          applyIgv,
          clientName: asText(clientName, 'Cliente POS'),
          clientEmail: asText(clientEmail) || undefined,
          clientPhone: asText(clientPhone) || undefined,
          note: buildOrderNote(orderNote, selectedPaymentMethod, paymentReference, amountPaid, change),
          items: cart.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
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

      const code = asText((payload as { data?: { code?: unknown } }).data?.code, 'VENTA');
      showAlert(`Venta creada: ${code}`, 'success', 4200);
      setCart([]);
      setShowPaymentDrawer(false);
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setClientAddress('');
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

      <section className="admin-pos-layout-next">
        <article className="admin-card admin-pos-catalog-next">
          <div className="admin-pos-toolbar-next">
            <input
              type="text"
              className="admin-pos-search-input-next"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
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
              <select
                className="admin-pos-store-select-next"
                value={selectedStoreId || ''}
                onChange={(event) => {
                  const nextStoreId = asPositiveInt(event.target.value);
                  setSelectedStoreId(nextStoreId);
                  setCart([]);
                }}
              >
                <option value="">Selecciona</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
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
                  onClick={() => openVariantSelector(product)}
                >
                  <div className="admin-pos-product-image-next">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} />
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
                <article key={item.variantId} className="admin-pos-cart-item-next">
                  <div className="admin-pos-cart-item-image-next">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.productName} /> : <span>N/A</span>}
                  </div>
                  <div className="admin-pos-cart-item-main-next">
                    <h5>{item.productName}</h5>
                    <p className="admin-pos-item-variant-next">{item.colorName} / {item.sizeName}</p>
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
                      onClick={() => removeFromCart(item.variantId)}
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
                  <img src={selectedVariant.imageUrl || selectedProduct.imageUrl || ''} alt={selectedProduct.name} />
                ) : (
                  <span>Sin imagen</span>
                )}
              </div>

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

              <div className="admin-pos-stock-info-next">
                <p>Stock: {selectedVariant.availableStock} disponible(s)</p>
              </div>

              <div className="admin-pos-variant-section-next">
                <label htmlFor="posVariantQuantity">Cantidad</label>
                <div className="admin-pos-quantity-selector-next">
                  <button
                    type="button"
                    onClick={() => {
                      const max = Math.max(1, selectedVariant.availableStock);
                      setVariantQuantity((current) => Math.max(1, Math.min(max, current - 1)));
                    }}
                  >
                    -
                  </button>
                  <input
                    id="posVariantQuantity"
                    type="number"
                    min={1}
                    max={Math.max(1, selectedVariant.availableStock)}
                    value={variantQuantity}
                    onChange={(event) => {
                      const next = Math.floor(Number(event.target.value || 1));
                      const safe = Math.max(1, Math.min(Math.max(1, selectedVariant.availableStock), next));
                      setVariantQuantity(safe);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const max = Math.max(1, selectedVariant.availableStock);
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
                disabled={!canSell || selectedVariant.availableStock <= 0}
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
              </div>

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
