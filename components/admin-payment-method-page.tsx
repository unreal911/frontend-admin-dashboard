'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminNameModal } from '@/components/admin-name-modal';
import { useAdminUi } from '@/components/admin-ui-provider';
import { AdminButton, AdminPageHeader } from '@/components/admin-design-system';

interface AdminPaymentMethod {
  id: number;
  name: string;
  code: string;
  isActive: boolean;
}

interface PaymentMethodsResponse {
  data?: AdminPaymentMethod[];
}

function normalizePaymentMethodsResponse(payload: unknown): AdminPaymentMethod[] {
  const data = (payload as PaymentMethodsResponse | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }

  const normalized: AdminPaymentMethod[] = [];
  for (const item of data) {
    const id = Number((item as AdminPaymentMethod).id);
    const name = String((item as AdminPaymentMethod).name || '').trim();
    const code = String((item as AdminPaymentMethod).code || '').trim();
    const isActive = Boolean((item as AdminPaymentMethod).isActive);
    if (!Number.isInteger(id) || id < 1 || !name) {
      continue;
    }
    normalized.push({
      id,
      name,
      code,
      isActive,
    });
  }
  return normalized;
}

export function AdminPaymentMethodPage() {
  const { confirm, showAlert } = useAdminUi();
  const [paymentMethods, setPaymentMethods] = useState<AdminPaymentMethod[]>([]);
  const [search, setSearch] = useState('');
  const [showActive, setShowActive] = useState(true);
  const [showInactive, setShowInactive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingItem, setEditingItem] = useState<AdminPaymentMethod | null>(null);

  async function loadPaymentMethods() {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/payment-methods?skip=1&take=200', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudieron cargar metodos de pago.'),
          'error',
        );
        setPaymentMethods([]);
        return;
      }
      setPaymentMethods(normalizePaymentMethodsResponse(payload));
    } catch {
      showAlert('No se pudo consultar metodos de pago.', 'error');
      setPaymentMethods([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPaymentMethods();
  }, []);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return paymentMethods.filter((paymentMethod) => {
      const matchesSearch =
        !normalizedSearch
        || paymentMethod.name.toLowerCase().includes(normalizedSearch)
        || paymentMethod.code.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        (showActive && paymentMethod.isActive) ||
        (showInactive && !paymentMethod.isActive) ||
        (!showActive && !showInactive);
      return matchesSearch && matchesStatus;
    });
  }, [paymentMethods, search, showActive, showInactive]);

  function openCreateModal() {
    setEditingItem(null);
    setModalMode('create');
    setModalOpen(true);
  }

  function openEditModal(item: AdminPaymentMethod) {
    setEditingItem(item);
    setModalMode('edit');
    setModalOpen(true);
  }

  function closeModal() {
    if (isMutating) {
      return;
    }
    setModalOpen(false);
    setEditingItem(null);
  }

  async function savePaymentMethod(name: string) {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      return;
    }

    setIsMutating(true);
    try {
      const endpoint = modalMode === 'create'
        ? '/api/admin/payment-methods'
        : `/api/admin/payment-methods/${editingItem?.id}`;
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
            || `No se pudo ${modalMode === 'create' ? 'crear' : 'actualizar'} el metodo de pago.`,
          ),
          'error',
        );
        return;
      }

      await loadPaymentMethods();
      setModalOpen(false);
      setEditingItem(null);
      showAlert(
        `Metodo de pago "${normalizedName}" ${modalMode === 'create' ? 'creado' : 'actualizado'}.`,
        'success',
      );
    } catch {
      showAlert(
        `No se pudo ${modalMode === 'create' ? 'crear' : 'actualizar'} el metodo de pago.`,
        'error',
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function togglePaymentMethod(item: AdminPaymentMethod) {
    const nextActive = !item.isActive;
    const confirmed = await confirm({
      title: nextActive ? 'Activar metodo de pago' : 'Desactivar metodo de pago',
      message: nextActive
        ? `Deseas activar el metodo de pago "${item.name}"?`
        : `Deseas desactivar el metodo de pago "${item.name}"?`,
      acceptText: nextActive ? 'Activar' : 'Desactivar',
      cancelText: 'Cancelar',
    });

    if (!confirmed) {
      return;
    }

    setIsMutating(true);
    try {
      const response = await fetch(`/api/admin/payment-methods/${item.id}`, {
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

      setPaymentMethods((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, isActive: nextActive } : entry)),
      );
      showAlert(`Metodo "${item.name}" ${nextActive ? 'activado' : 'desactivado'}.`, 'success');
    } catch {
      showAlert('No se pudo actualizar el estado del metodo de pago.', 'error');
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <section className="admin-dashboard-grid">
      <AdminPageHeader
        eyebrow="Configuración"
        title="Métodos de pago"
        description="Configura las formas de pago disponibles en ventas."
        actions={<AdminButton type="button" onClick={openCreateModal} disabled={isMutating}>Agregar</AdminButton>}
      />
      <article className="admin-card admin-filters-card-next">
        <fieldset className="admin-filters-fieldset-next">
          <legend className="admin-filters-legend-next">Filtros</legend>
          <div className="admin-filters-layout-next">
            <div className="admin-toolbar-join-next">
              <input
                type="text"
                placeholder="Buscar por nombre o codigo"
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
          </div>
        </fieldset>

        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table list-cards-next">
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Codigo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} data-label="Estado">
                    Cargando metodos de pago...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} data-label="Estado">
                    No hay metodos de pago para mostrar.
                  </td>
                </tr>
              ) : (
                filtered.map((item, index) => (
                  <tr key={item.id}>
                    <td data-label="#">{index + 1}</td>
                    <td data-label="Nombre" className="list-card-title-next">{item.name}</td>
                    <td data-label="Codigo">{item.code || '-'}</td>
                    <td data-label="Estado">
                      <span className={`admin-pill ${item.isActive ? 'success' : 'error'}`}>
                        {item.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td data-label="Accion">
                      <div className="admin-table-actions">
                        <button type="button" className="admin-ghost-btn" onClick={() => openEditModal(item)}>
                          Editar
                        </button>
                        <button type="button" className="admin-ghost-btn" onClick={() => togglePaymentMethod(item)}>
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

      <AdminNameModal
        open={modalOpen}
        mode={modalMode}
        createTitle="Crear metodo de pago"
        createDescription="Agrega un nuevo metodo para POS y ventas."
        editTitle="Editar metodo de pago"
        editDescription="Actualiza el nombre del metodo de pago seleccionado."
        fieldLabel="Nombre del metodo"
        fieldPlaceholder="Ejemplo: Link de pago"
        initialValue={editingItem?.name || ''}
        isSubmitting={isMutating}
        onClose={closeModal}
        onSubmit={savePaymentMethod}
      />
    </section>
  );
}
