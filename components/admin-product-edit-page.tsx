'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AdminCategoryOption,
  AdminColorOption,
  AdminProductDetail,
  AdminProductModal,
  AdminProductModalSubmitPayload,
  AdminSizeOption,
} from '@/components/admin-product-modal';
import { useAdminUi } from '@/components/admin-ui-provider';
import { normalizeProductDetail } from '@/lib/admin-product-normalizers';

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
    normalized.push({
      id,
      name,
      hex: String(item.hex || '').trim() || null,
    });
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

interface AdminProductEditPageProps {
  productId: number;
}

export function AdminProductEditPage({ productId }: AdminProductEditPageProps) {
  const router = useRouter();
  const { showAlert } = useAdminUi();

  const [categories, setCategories] = useState<AdminCategoryOption[]>([]);
  const [colors, setColors] = useState<AdminColorOption[]>([]);
  const [sizes, setSizes] = useState<AdminSizeOption[]>([]);
  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadEverything() {
      setIsLoading(true);
      setLoadError('');
      try {
        const [categoriesResponse, colorsResponse, sizesResponse, productResponse] = await Promise.all([
          fetch('/api/admin/categories?skip=1&take=300&isActive=true', { cache: 'no-store' }).catch(() => null),
          fetch('/api/admin/colors?skip=1&take=300&isActive=true', { cache: 'no-store' }).catch(() => null),
          fetch('/api/admin/sizes?skip=1&take=300&isActive=true', { cache: 'no-store' }).catch(() => null),
          fetch(`/api/admin/products/${productId}`, { cache: 'no-store' }).catch(() => null),
        ]);

        if (cancelled) {
          return;
        }

        if (categoriesResponse?.ok) {
          const payload = await categoriesResponse.json().catch(() => null);
          setCategories(normalizeCategories(payload));
        }

        if (colorsResponse?.ok) {
          const payload = await colorsResponse.json().catch(() => null);
          setColors(normalizeColors(payload));
        }

        if (sizesResponse?.ok) {
          const payload = await sizesResponse.json().catch(() => null);
          setSizes(normalizeSizes(payload));
        }

        if (!productResponse?.ok) {
          const payload = productResponse ? await productResponse.json().catch(() => null) : null;
          const message = String(
            (payload as { message?: unknown } | null)?.message || 'No se pudo cargar el producto para editar.',
          );
          setLoadError(message);
          showAlert(message, 'error');
          return;
        }

        const payload = await productResponse.json().catch(() => null);
        const normalized = normalizeProductDetail(payload);
        if (!normalized) {
          setLoadError('No se pudo interpretar la respuesta del producto.');
          showAlert('No se pudo interpretar la respuesta del producto.', 'error');
          return;
        }
        setProduct(normalized);

        if (!categoriesResponse?.ok || !colorsResponse?.ok || !sizesResponse?.ok) {
          showAlert('Algunos catalogos no se pudieron cargar.', 'warning');
        }
      } catch {
        if (!cancelled) {
          setLoadError('No se pudo cargar el producto para editar.');
          showAlert('No se pudo cargar el producto para editar.', 'error');
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
  }, [productId, showAlert]);

  async function saveProduct(event: AdminProductModalSubmitPayload) {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/products/${event.id ?? productId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event.payload),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = String(
          (payload as { message?: unknown } | null)?.message || 'No se pudo actualizar el producto.',
        );
        throw new Error(message);
      }

      showAlert('Producto actualizado correctamente.', 'success');
      router.push('/admin/product');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar el producto.';
      showAlert(message, 'error');
      throw new Error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <section className="admin-dashboard-grid admin-product-create-view">
        <article className="admin-card">
          <p>Cargando producto...</p>
        </article>
      </section>
    );
  }

  if (loadError || !product) {
    return (
      <section className="admin-dashboard-grid admin-product-create-view">
        <article className="admin-card">
          <p>{loadError || 'No se encontro el producto.'}</p>
          <button type="button" className="admin-primary-btn" onClick={() => router.push('/admin/product')}>
            Volver a productos
          </button>
        </article>
      </section>
    );
  }

  return (
    <section className="admin-dashboard-grid admin-product-create-view">
      <AdminProductModal
        open
        variant="page"
        product={product}
        categories={categories}
        colors={colors}
        sizes={sizes}
        isSubmitting={isSubmitting}
        title="Editar producto"
        description="Actualiza la informacion, variantes e imagenes del producto desde esta vista."
        cancelLabel="Volver"
        onClose={() => router.push('/admin/product')}
        onSubmit={saveProduct}
      />
    </section>
  );
}
