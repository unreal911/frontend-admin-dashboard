'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AdminCategoryOption,
  AdminColorOption,
  AdminProductModal,
  AdminProductModalSubmitPayload,
  AdminSizeOption,
} from '@/components/admin-product-modal';
import { useAdminUi } from '@/components/admin-ui-provider';

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

export function AdminProductCreatePage() {
  const router = useRouter();
  const { showAlert } = useAdminUi();

  const [categories, setCategories] = useState<AdminCategoryOption[]>([]);
  const [colors, setColors] = useState<AdminColorOption[]>([]);
  const [sizes, setSizes] = useState<AdminSizeOption[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      setIsLoadingMetadata(true);
      try {
        const [categoriesResponse, colorsResponse, sizesResponse] = await Promise.all([
          fetch('/api/admin/categories?skip=1&take=300&isActive=true', { cache: 'no-store' }).catch(() => null),
          fetch('/api/admin/colors?skip=1&take=300&isActive=true', { cache: 'no-store' }).catch(() => null),
          fetch('/api/admin/sizes?skip=1&take=300&isActive=true', { cache: 'no-store' }).catch(() => null),
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

        if (!categoriesResponse?.ok || !colorsResponse?.ok || !sizesResponse?.ok) {
          showAlert('Algunos catalogos no se pudieron cargar.', 'warning');
        }
      } catch {
        if (!cancelled) {
          showAlert('No se pudieron cargar los catalogos del producto.', 'error');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMetadata(false);
        }
      }
    }

    loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [showAlert]);

  async function saveProduct(event: AdminProductModalSubmitPayload) {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event.payload),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = String(
          (payload as { message?: unknown } | null)?.message || 'No se pudo crear el producto.',
        );
        throw new Error(message);
      }

      showAlert('Producto creado correctamente.', 'success');
      router.push('/admin/product');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear el producto.';
      showAlert(message, 'error');
      throw new Error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="admin-dashboard-grid admin-product-create-view">
      {isLoadingMetadata ? (
        <article className="admin-card">
          <p>Cargando catalogos...</p>
        </article>
      ) : null}

      <AdminProductModal
        open
        variant="page"
        product={null}
        categories={categories}
        colors={colors}
        sizes={sizes}
        isSubmitting={isSubmitting}
        title="Crear producto"
        description="Completa la informacion, genera variantes y guarda el producto desde esta vista."
        cancelLabel="Volver"
        onClose={() => router.push('/admin/product')}
        onSubmit={saveProduct}
      />
    </section>
  );
}
