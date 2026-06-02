'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminNameModal } from '@/components/admin-name-modal';
import { useAdminUi } from '@/components/admin-ui-provider';

interface AdminCategory {
  id: number;
  name: string;
  isActive: boolean;
}

interface CategoriesResponse {
  data?: AdminCategory[];
}

function normalizeCategoriesResponse(payload: unknown): AdminCategory[] {
  const data = (payload as CategoriesResponse | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => {
      const id = Number((item as AdminCategory).id);
      const name = String((item as AdminCategory).name || '').trim();
      const isActive = Boolean((item as AdminCategory).isActive);
      if (!Number.isInteger(id) || id < 1 || !name) {
        return null;
      }
      return { id, name, isActive };
    })
    .filter((item): item is AdminCategory => Boolean(item));
}

export function AdminCategoryPage() {
  const { confirm, showAlert } = useAdminUi();
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [search, setSearch] = useState('');
  const [showActive, setShowActive] = useState(true);
  const [showInactive, setShowInactive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingCategory, setEditingCategory] = useState<AdminCategory | null>(null);

  async function loadCategories() {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/categories?skip=1&take=200', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudieron cargar las categorias.'),
          'error',
        );
        setCategories([]);
        return;
      }

      setCategories(normalizeCategoriesResponse(payload));
    } catch {
      showAlert('No se pudo consultar categorias.', 'error');
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return categories.filter((category) => {
      const matchesSearch = !normalizedSearch || category.name.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        (showActive && category.isActive) ||
        (showInactive && !category.isActive) ||
        (!showActive && !showInactive);

      return matchesSearch && matchesStatus;
    });
  }, [categories, search, showActive, showInactive]);

  function openCreateModal() {
    setEditingCategory(null);
    setModalMode('create');
    setModalOpen(true);
  }

  function openEditModal(category: AdminCategory) {
    setEditingCategory(category);
    setModalMode('edit');
    setModalOpen(true);
  }

  function closeModal() {
    if (isMutating) {
      return;
    }
    setModalOpen(false);
    setEditingCategory(null);
  }

  async function saveCategory(name: string) {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      return;
    }

    setIsMutating(true);
    try {
      const endpoint = modalMode === 'create'
        ? '/api/admin/categories'
        : `/api/admin/categories/${editingCategory?.id}`;
      const method = modalMode === 'create' ? 'POST' : 'PUT';

      const response = await fetch(endpoint, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: normalizedName }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String(
            (payload as { message?: unknown } | null)?.message
            || `No se pudo ${modalMode === 'create' ? 'crear' : 'actualizar'} la categoria.`,
          ),
          'error',
        );
        return;
      }

      await loadCategories();
      setModalOpen(false);
      setEditingCategory(null);
      showAlert(
        `Categoria "${normalizedName}" ${modalMode === 'create' ? 'creada' : 'actualizada'}.`,
        'success',
      );
    } catch {
      showAlert(
        `No se pudo ${modalMode === 'create' ? 'crear' : 'actualizar'} la categoria.`,
        'error',
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function toggleCategory(category: AdminCategory) {
    const nextActive = !category.isActive;
    const confirmed = await confirm({
      title: nextActive ? 'Activar categoria' : 'Desactivar categoria',
      message: nextActive
        ? `Deseas activar la categoria "${category.name}"?`
        : `Deseas desactivar la categoria "${category.name}"?`,
      acceptText: nextActive ? 'Activar' : 'Desactivar',
      cancelText: 'Cancelar',
    });

    if (!confirmed) {
      return;
    }

    setIsMutating(true);
    try {
      const response = await fetch(`/api/admin/categories/${category.id}`, {
        method: 'PUT',
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

      setCategories((current) =>
        current.map((item) => (item.id === category.id ? { ...item, isActive: nextActive } : item)),
      );
      showAlert(`Categoria "${category.name}" ${nextActive ? 'activada' : 'desactivada'}.`, 'success');
    } catch {
      showAlert('No se pudo actualizar el estado de la categoria.', 'error');
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
                placeholder="Buscar por nombre"
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
              <button type="button" className="admin-primary-btn" onClick={openCreateModal} disabled={isMutating}>
                Agregar
              </button>
            </div>
          </div>
        </fieldset>

        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} data-label="Estado">
                    Cargando categorias...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} data-label="Estado">
                    No hay categorias para mostrar.
                  </td>
                </tr>
              ) : (
                filtered.map((category, index) => (
                  <tr key={category.id}>
                    <td data-label="#">{index + 1}</td>
                    <td data-label="Nombre">{category.name}</td>
                    <td data-label="Estado">
                      <span className={`admin-pill ${category.isActive ? 'success' : 'error'}`}>
                        {category.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td data-label="Accion">
                      <div className="admin-table-actions">
                        <button type="button" className="admin-ghost-btn" onClick={() => openEditModal(category)}>
                          Editar
                        </button>
                        <button type="button" className="admin-ghost-btn" onClick={() => toggleCategory(category)}>
                          {category.isActive ? 'Desactivar' : 'Activar'}
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

      <AdminNameModal
        open={modalOpen}
        mode={modalMode}
        createTitle="Crear nueva categoria"
        createDescription="Agrega una nueva categoria al catalogo."
        editTitle="Editar categoria"
        editDescription="Modifica el nombre de la categoria seleccionada."
        fieldLabel="Nombre de la categoria"
        fieldPlaceholder="Ingresa el nombre..."
        initialValue={editingCategory?.name || ''}
        isSubmitting={isMutating}
        onClose={closeModal}
        onSubmit={saveCategory}
      />
    </section>
  );
}
