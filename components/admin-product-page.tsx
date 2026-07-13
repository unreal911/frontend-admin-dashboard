'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminCategoryOption } from '@/components/admin-product-modal';
import { useAdminUi } from '@/components/admin-ui-provider';

interface AdminProductListItem {
  id: number;
  name: string;
  categoryId: number;
  isActive: boolean;
  variantCount?: number;
  imageCount?: number;
  category?: { id: number; name: string } | null;
}

interface ProductListResponse {
  data?: AdminProductListItem[];
}

interface CategoriesResponse {
  data?: AdminCategoryOption[];
}

function toPositiveNumber(value: unknown): number {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : 0;
}

function toNumber(value: unknown): number {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function normalizeProductList(payload: unknown): AdminProductListItem[] {
  const data = (payload as ProductListResponse | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }

  const normalized: AdminProductListItem[] = [];
  for (const item of data) {
    const id = toPositiveNumber((item as AdminProductListItem).id);
    const name = String((item as AdminProductListItem).name || '').trim();
    const categoryId = toPositiveNumber((item as AdminProductListItem).categoryId);
    const isActive = Boolean((item as AdminProductListItem).isActive);
    if (!id || !name || !categoryId) {
      continue;
    }

    const categoryRaw = (item as AdminProductListItem).category;
    const category = categoryRaw && toPositiveNumber(categoryRaw.id) && String(categoryRaw.name || '').trim()
      ? {
        id: toPositiveNumber(categoryRaw.id),
        name: String(categoryRaw.name || '').trim(),
      }
      : null;

    normalized.push({
      id,
      name,
      categoryId,
      isActive,
      variantCount: toNumber((item as AdminProductListItem).variantCount) || 0,
      imageCount: toNumber((item as AdminProductListItem).imageCount) || 0,
      category,
    });
  }
  return normalized;
}

function normalizeCategories(payload: unknown): AdminCategoryOption[] {
  const data = (payload as CategoriesResponse | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((item) => {
      const id = toPositiveNumber((item as AdminCategoryOption).id);
      const name = String((item as AdminCategoryOption).name || '').trim();
      return id && name ? { id, name } : null;
    })
    .filter((item): item is AdminCategoryOption => Boolean(item));
}

export function AdminProductPage() {
  const { confirm, showAlert } = useAdminUi();

  const [products, setProducts] = useState<AdminProductListItem[]>([]);
  const [categories, setCategories] = useState<AdminCategoryOption[]>([]);

  const [search, setSearch] = useState('');
  const [showActive, setShowActive] = useState(true);
  const [showInactive, setShowInactive] = useState(true);

  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  async function loadProducts() {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/products?skip=1&take=200', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudieron cargar productos.'),
          'error',
        );
        setProducts([]);
        return;
      }
      setProducts(normalizeProductList(payload));
    } catch {
      showAlert('No se pudo consultar productos.', 'error');
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMetadata() {
    const categoriesResponse = await fetch(
      '/api/admin/categories?skip=1&take=300&isActive=true',
      { cache: 'no-store' },
    ).catch(() => null);

    if (categoriesResponse?.ok) {
      const payload = await categoriesResponse.json().catch(() => null);
      setCategories(normalizeCategories(payload));
    }
  }

  useEffect(() => {
    loadProducts();
    loadMetadata();
  }, []);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch = !normalizedSearch || product.name.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        (showActive && product.isActive) ||
        (showInactive && !product.isActive) ||
        (!showActive && !showInactive);
      return matchesSearch && matchesStatus;
    });
  }, [products, search, showActive, showInactive]);

  function resolveCategoryName(item: AdminProductListItem): string {
    if (item.category?.name) {
      return item.category.name;
    }
    return categories.find((category) => category.id === item.categoryId)?.name || String(item.categoryId);
  }

  async function toggleProduct(item: AdminProductListItem) {
    const nextActive = !item.isActive;
    const confirmed = await confirm({
      title: nextActive ? 'Activar producto' : 'Desactivar producto',
      message: nextActive
        ? `Deseas activar el producto "${item.name}"?`
        : `Deseas desactivar el producto "${item.name}"?`,
      acceptText: nextActive ? 'Activar' : 'Desactivar',
      cancelText: 'Cancelar',
    });
    if (!confirmed) {
      return;
    }

    setIsMutating(true);
    try {
      const response = await fetch(`/api/admin/products/${item.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudo actualizar el estado.'),
          'error',
        );
        return;
      }

      setProducts((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, isActive: nextActive } : entry)),
      );
      showAlert(`Producto "${item.name}" ${nextActive ? 'activado' : 'desactivado'}.`, 'success');
    } catch {
      showAlert('No se pudo actualizar el estado del producto.', 'error');
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card admin-filters-card-next">
        <fieldset className="admin-filters-fieldset-next">
          <legend className="admin-filters-legend-next">Settings</legend>
          <div className="admin-filters-layout-next">
            <div className="admin-toolbar-join-next">
              <input
                type="text"
                placeholder="Buscar por nombre de producto"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="admin-toolbar-checks-next">
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={showActive}
                  onChange={(event) => setShowActive(event.target.checked)}
                />
                Activos
              </label>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(event) => setShowInactive(event.target.checked)}
                />
                Inactivos
              </label>
            </div>
            <div className="admin-filters-actions-next">
              <Link
                href="/admin/product/create"
                className={`admin-primary-btn ${isMutating ? 'disabled' : ''}`}
                aria-disabled={isMutating}
              >
                Agregar
              </Link>
            </div>
          </div>
        </fieldset>

        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table list-cards-next">
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Categoria</th>
                <th>Variantes</th>
                <th>Imagenes</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} data-label="Estado">
                    Cargando productos...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} data-label="Estado">
                    No hay productos para mostrar.
                  </td>
                </tr>
              ) : (
                filtered.map((item, index) => (
                  <tr key={item.id}>
                    <td data-label="#">{index + 1}</td>
                    <td data-label="Nombre" className="list-card-title-next">{item.name}</td>
                    <td data-label="Categoria">{resolveCategoryName(item)}</td>
                    <td data-label="Variantes">{toNumber(item.variantCount) || 0}</td>
                    <td data-label="Imagenes">{toNumber(item.imageCount) || 0}</td>
                    <td data-label="Estado">
                      <span className={`admin-pill ${item.isActive ? 'success' : 'error'}`}>
                        {item.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td data-label="Accion">
                      <div className="admin-table-actions">
                        <Link
                          href={`/admin/product/${item.id}/edit`}
                          className={`admin-ghost-btn ${isMutating ? 'disabled' : ''}`}
                          aria-disabled={isMutating}
                        >
                          Editar
                        </Link>
                        <button
                          type="button"
                          className="admin-ghost-btn"
                          onClick={() => toggleProduct(item)}
                          disabled={isMutating}
                        >
                          {item.isActive ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
