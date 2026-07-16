'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AdminCategoryOption,
  AdminColorOption,
  AdminProductDetail,
  AdminSizeOption,
} from '@/components/admin-product-modal';
import { AdminProductVariantsManager } from '@/components/admin-product-variants-manager';
import { useAdminUi } from '@/components/admin-ui-provider';
import { normalizeProductDetail } from '@/lib/admin-product-normalizers';
import { parseVariantMode } from '@/lib/product-form-utils';
import {
  Inventory,
  InventoryStore,
  normalizeInventoryList,
} from '@/lib/admin-inventory-types';

interface CategoriesResponse {
  data?: AdminCategoryOption[];
}

interface ColorsResponse {
  data?: AdminColorOption[];
}

interface SizesResponse {
  data?: AdminSizeOption[];
}

function toPositiveNumber(value: unknown): number {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : 0;
}

function normalizeCategories(payload: unknown): AdminCategoryOption[] {
  const data = (payload as CategoriesResponse | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((item) => {
      const id = toPositiveNumber(item.id);
      const name = String(item.name || '').trim();
      return id && name ? { id, name } : null;
    })
    .filter((item): item is AdminCategoryOption => Boolean(item));
}

function normalizeColors(payload: unknown): AdminColorOption[] {
  const data = (payload as ColorsResponse | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  const normalized: AdminColorOption[] = [];
  for (const item of data) {
    const id = toPositiveNumber(item.id);
    const name = String(item.name || '').trim();
    if (!id || !name) {
      continue;
    }
    normalized.push({ id, name, hex: String(item.hex || '').trim() || null });
  }
  return normalized;
}

function normalizeSizes(payload: unknown): AdminSizeOption[] {
  const data = (payload as SizesResponse | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((item) => {
      const id = toPositiveNumber(item.id);
      const name = String(item.name || '').trim();
      return id && name ? { id, name } : null;
    })
    .filter((item): item is AdminSizeOption => Boolean(item));
}

const VARIANT_MODE_LABEL: Record<string, string> = {
  SIMPLE: 'Producto unico',
  SIZE_ONLY: 'Con talla',
  MATRIX: 'Con talla y color',
};

interface AdminProductDetailPageProps {
  productId: number;
}

export function AdminProductDetailPage({ productId }: AdminProductDetailPageProps) {
  const router = useRouter();
  const { showAlert } = useAdminUi();

  const [categories, setCategories] = useState<AdminCategoryOption[]>([]);
  const [colors, setColors] = useState<AdminColorOption[]>([]);
  const [sizes, setSizes] = useState<AdminSizeOption[]>([]);
  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  const [stores, setStores] = useState<InventoryStore[]>([]);
  const [inventoryRows, setInventoryRows] = useState<Inventory[]>([]);
  const [version, setVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Carga producto + inventario del producto (stock/reservado por variante y tienda).
  const loadProduct = useCallback(async () => {
    const [productResponse, inventoryResponse] = await Promise.all([
      fetch(`/api/admin/products/${productId}`, { cache: 'no-store' }).catch(() => null),
      fetch('/api/admin/inventory?includeZero=false&take=1000', { cache: 'no-store' }).catch(() => null),
    ]);

    if (!productResponse?.ok) {
      const payload = productResponse ? await productResponse.json().catch(() => null) : null;
      const message = String((payload as { message?: unknown } | null)?.message || 'No se pudo cargar el producto.');
      setLoadError(message);
      showAlert(message, 'error');
      return;
    }

    const normalized = normalizeProductDetail(await productResponse.json().catch(() => null));
    if (!normalized) {
      setLoadError('No se pudo interpretar la respuesta del producto.');
      return;
    }

    if (inventoryResponse?.ok) {
      const rows = normalizeInventoryList(await inventoryResponse.json().catch(() => null))
        .filter((row) => row.variant.product.id === productId);
      setInventoryRows(rows);
    } else {
      setInventoryRows([]);
    }

    setLoadError('');
    setProduct(normalized);
    setVersion((current) => current + 1);
  }, [productId, showAlert]);

  useEffect(() => {
    let cancelled = false;

    async function loadEverything() {
      setIsLoading(true);
      try {
        const [categoriesResponse, colorsResponse, sizesResponse, storesResponse] = await Promise.all([
          fetch('/api/admin/categories?skip=1&take=300&isActive=true', { cache: 'no-store' }).catch(() => null),
          fetch('/api/admin/colors?skip=1&take=300&isActive=true', { cache: 'no-store' }).catch(() => null),
          fetch('/api/admin/sizes?skip=1&take=300&isActive=true', { cache: 'no-store' }).catch(() => null),
          fetch('/api/admin/stores?skip=1&take=200', { cache: 'no-store' }).catch(() => null),
        ]);

        if (cancelled) {
          return;
        }

        if (categoriesResponse?.ok) {
          setCategories(normalizeCategories(await categoriesResponse.json().catch(() => null)));
        }
        if (colorsResponse?.ok) {
          setColors(normalizeColors(await colorsResponse.json().catch(() => null)));
        }
        if (sizesResponse?.ok) {
          setSizes(normalizeSizes(await sizesResponse.json().catch(() => null)));
        }
        if (storesResponse?.ok) {
          const payload = await storesResponse.json().catch(() => null);
          const list = Array.isArray(payload) ? payload : [];
          setStores(
            (list as InventoryStore[]).filter((store) => Number.isInteger(Number(store.id)) && String(store.name || '').trim()),
          );
        }

        await loadProduct();
      } catch {
        if (!cancelled) {
          setLoadError('No se pudo cargar el producto.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadEverything();

    return () => {
      cancelled = true;
    };
  }, [loadProduct]);

  if (isLoading) {
    return (
      <section className="admin-dashboard-grid">
        <article className="admin-card"><p>Cargando producto...</p></article>
      </section>
    );
  }

  if (loadError || !product) {
    return (
      <section className="admin-dashboard-grid">
        <article className="admin-card">
          <p>{loadError || 'No se encontro el producto.'}</p>
          <button type="button" className="admin-primary-btn" onClick={() => router.push('/admin/product')}>
            Volver a productos
          </button>
        </article>
      </section>
    );
  }

  const categoryName = categories.find((category) => category.id === product.categoryId)?.name || String(product.categoryId);
  const mode = parseVariantMode(product.variantMode);
  const imageCount = Array.isArray(product.images) ? product.images.length : 0;

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card admin-product-detail-head-next">
        <div className="admin-product-detail-summary-next">
          <p className="section-kicker">Detalle de producto</p>
          <h1 className="section-title">{product.name}</h1>
          <div className="admin-product-detail-meta-next">
            <span className="admin-pill">{VARIANT_MODE_LABEL[mode] || mode}</span>
            <span className={`admin-pill ${product.isActive ? 'success' : 'error'}`}>
              {product.isActive ? 'Activo' : 'Inactivo'}
            </span>
            <span className="admin-muted-text">Categoria: {categoryName}</span>
            <span className="admin-muted-text">Imagenes: {imageCount}</span>
            <span className="admin-muted-text">Variantes: {product.variants?.length || 0}</span>
          </div>
        </div>
        <div className="admin-product-detail-actions-next">
          <Link href={`/admin/product/${productId}/edit`} className="admin-ghost-btn">Editar datos</Link>
          <Link href="/admin/product" className="admin-ghost-btn">Volver</Link>
        </div>
      </article>

      <AdminProductVariantsManager
        key={version}
        productId={productId}
        product={product}
        colors={colors}
        sizes={sizes}
        stores={stores}
        inventoryRows={inventoryRows}
        onSaved={loadProduct}
      />
    </section>
  );
}
