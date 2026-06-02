'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminNameModal } from '@/components/admin-name-modal';
import { useAdminUi } from '@/components/admin-ui-provider';

interface AdminSize {
  id: number;
  name: string;
  isActive: boolean;
}

interface SizesResponse {
  data?: AdminSize[];
}

function normalizeSizesResponse(payload: unknown): AdminSize[] {
  const data = (payload as SizesResponse | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => {
      const id = Number((item as AdminSize).id);
      const name = String((item as AdminSize).name || '').trim();
      const isActive = Boolean((item as AdminSize).isActive);
      if (!Number.isInteger(id) || id < 1 || !name) {
        return null;
      }
      return { id, name, isActive };
    })
    .filter((item): item is AdminSize => Boolean(item));
}

export function AdminSizePage() {
  const { confirm, showAlert } = useAdminUi();
  const [sizes, setSizes] = useState<AdminSize[]>([]);
  const [search, setSearch] = useState('');
  const [showActive, setShowActive] = useState(true);
  const [showInactive, setShowInactive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingSize, setEditingSize] = useState<AdminSize | null>(null);

  async function loadSizes() {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/sizes?skip=1&take=200', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudieron cargar tallas.'),
          'error',
        );
        setSizes([]);
        return;
      }
      setSizes(normalizeSizesResponse(payload));
    } catch {
      showAlert('No se pudo consultar tallas.', 'error');
      setSizes([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSizes();
  }, []);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return sizes.filter((size) => {
      const matchesSearch = !normalizedSearch || size.name.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        (showActive && size.isActive) ||
        (showInactive && !size.isActive) ||
        (!showActive && !showInactive);
      return matchesSearch && matchesStatus;
    });
  }, [sizes, search, showActive, showInactive]);

  function openCreateModal() {
    setEditingSize(null);
    setModalMode('create');
    setModalOpen(true);
  }

  function openEditModal(size: AdminSize) {
    setEditingSize(size);
    setModalMode('edit');
    setModalOpen(true);
  }

  function closeModal() {
    if (isMutating) {
      return;
    }
    setModalOpen(false);
    setEditingSize(null);
  }

  async function saveSize(name: string) {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      return;
    }

    setIsMutating(true);
    try {
      const endpoint = modalMode === 'create'
        ? '/api/admin/sizes'
        : `/api/admin/sizes/${editingSize?.id}`;
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
            || `No se pudo ${modalMode === 'create' ? 'crear' : 'actualizar'} la talla.`,
          ),
          'error',
        );
        return;
      }

      await loadSizes();
      setModalOpen(false);
      setEditingSize(null);
      showAlert(
        `Talla "${normalizedName}" ${modalMode === 'create' ? 'creada' : 'actualizada'}.`,
        'success',
      );
    } catch {
      showAlert(
        `No se pudo ${modalMode === 'create' ? 'crear' : 'actualizar'} la talla.`,
        'error',
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function toggleSize(size: AdminSize) {
    const nextActive = !size.isActive;
    const confirmed = await confirm({
      title: nextActive ? 'Activar talla' : 'Desactivar talla',
      message: nextActive
        ? `Deseas activar la talla "${size.name}"?`
        : `Deseas desactivar la talla "${size.name}"?`,
      acceptText: nextActive ? 'Activar' : 'Desactivar',
      cancelText: 'Cancelar',
    });

    if (!confirmed) {
      return;
    }

    setIsMutating(true);
    try {
      const response = await fetch(`/api/admin/sizes/${size.id}`, {
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

      setSizes((current) =>
        current.map((item) => (item.id === size.id ? { ...item, isActive: nextActive } : item)),
      );
      showAlert(`Talla "${size.name}" ${nextActive ? 'activada' : 'desactivada'}.`, 'success');
    } catch {
      showAlert('No se pudo actualizar el estado de la talla.', 'error');
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
                    Cargando tallas...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} data-label="Estado">
                    No hay tallas para mostrar.
                  </td>
                </tr>
              ) : (
                filtered.map((size, index) => (
                  <tr key={size.id}>
                    <td data-label="#">{index + 1}</td>
                    <td data-label="Nombre">{size.name}</td>
                    <td data-label="Estado">
                      <span className={`admin-pill ${size.isActive ? 'success' : 'error'}`}>
                        {size.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td data-label="Accion">
                      <div className="admin-table-actions">
                        <button type="button" className="admin-ghost-btn" onClick={() => openEditModal(size)}>
                          Editar
                        </button>
                        <button type="button" className="admin-ghost-btn" onClick={() => toggleSize(size)}>
                          {size.isActive ? 'Desactivar' : 'Activar'}
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
        createTitle="Crear nueva talla"
        createDescription="Agrega una nueva talla al catalogo."
        editTitle="Editar talla"
        editDescription="Modifica el nombre de la talla seleccionada."
        fieldLabel="Nombre de la talla"
        fieldPlaceholder="Ingresa el nombre..."
        initialValue={editingSize?.name || ''}
        isSubmitting={isMutating}
        onClose={closeModal}
        onSubmit={saveSize}
      />
    </section>
  );
}
