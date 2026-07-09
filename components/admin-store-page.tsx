'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAdminUi } from '@/components/admin-ui-provider';

type StoreType = 'STORE' | 'WAREHOUSE';

interface AdminStore {
  id: number;
  name: string;
  code: string;
  type: StoreType;
  address: string | null;
  isActive: boolean;
}

interface StoreFormState {
  name: string;
  code: string;
  type: StoreType;
  address: string;
}

const DEFAULT_FORM: StoreFormState = {
  name: '',
  code: '',
  type: 'STORE',
  address: '',
};

function normalizeStoreType(value: unknown): StoreType {
  return String(value || '').trim().toUpperCase() === 'WAREHOUSE' ? 'WAREHOUSE' : 'STORE';
}

function normalizeStoresResponse(payload: unknown): AdminStore[] {
  const raw = Array.isArray(payload)
    ? payload
    : (Array.isArray((payload as { data?: unknown[] } | null)?.data) ? (payload as { data: unknown[] }).data : []);

  const normalized: AdminStore[] = [];
  for (const item of raw) {
    const record = item as Partial<AdminStore>;
    const id = Number(record.id);
    const name = String(record.name || '').trim();
    const code = String(record.code || '').trim();
    if (!Number.isInteger(id) || id < 1 || !name || !code) {
      continue;
    }

    normalized.push({
      id,
      name,
      code,
      type: normalizeStoreType(record.type),
      address: String(record.address || '').trim() || null,
      isActive: Boolean(record.isActive),
    });
  }

  return normalized;
}

function getStorePayload(form: StoreFormState) {
  const payload: { name: string; code: string; type: StoreType; address?: string } = {
    name: form.name.trim(),
    code: form.code.trim(),
    type: form.type,
  };

  const address = form.address.trim();
  if (address) {
    payload.address = address;
  }

  return payload;
}

export function AdminStorePage() {
  const { confirm, showAlert } = useAdminUi();
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [filterType, setFilterType] = useState<'' | StoreType>('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<AdminStore | null>(null);
  const [form, setForm] = useState<StoreFormState>(DEFAULT_FORM);

  const canSave = useMemo(() => {
    return Boolean(form.name.trim() && form.code.trim() && form.type) && !isMutating;
  }, [form, isMutating]);

  async function loadStores(overrides?: Partial<{ search: string; type: '' | StoreType; includeInactive: boolean }>) {
    const searchValue = String(overrides?.search ?? searchApplied).trim();
    const typeValue = overrides?.type ?? filterType;
    const includeInactiveValue = overrides?.includeInactive ?? includeInactive;

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        skip: '1',
        take: '100',
      });
      if (searchValue) {
        params.set('search', searchValue);
      }
      if (typeValue) {
        params.set('type', typeValue);
      }
      params.set('includeInactive', String(includeInactiveValue));

      const response = await fetch(`/api/admin/stores?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudieron cargar las tiendas.'),
          'error',
        );
        setStores([]);
        return;
      }

      setStores(normalizeStoresResponse(payload));
    } catch {
      showAlert('No se pudieron cargar las tiendas.', 'error');
      setStores([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadStores();
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextSearch = searchInput.trim();
      if (nextSearch === searchApplied) {
        return;
      }
      setSearchApplied(nextSearch);
      loadStores({ search: nextSearch });
    }, 360);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput, searchApplied]);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isMutating) {
        closeModal();
      }
    }

    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
    };
  }, [modalOpen, isMutating]);

  function onSubmitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = searchInput.trim();
    setSearchApplied(nextSearch);
    loadStores({ search: nextSearch });
  }

  function clearFilters() {
    setSearchInput('');
    setSearchApplied('');
    setFilterType('');
    setIncludeInactive(false);
    loadStores({
      search: '',
      type: '',
      includeInactive: false,
    });
  }

  function openCreateModal() {
    setEditingStore(null);
    setForm(DEFAULT_FORM);
    setModalOpen(true);
  }

  function openEditModal(store: AdminStore) {
    setEditingStore(store);
    setForm({
      name: store.name,
      code: store.code,
      type: store.type,
      address: store.address || '',
    });
    setModalOpen(true);
  }

  function closeModal() {
    if (isMutating) {
      return;
    }
    setModalOpen(false);
    setEditingStore(null);
    setForm(DEFAULT_FORM);
  }

  async function saveStore() {
    if (!canSave) {
      return;
    }

    const payload = getStorePayload(form);
    setIsMutating(true);
    try {
      const endpoint = editingStore ? `/api/admin/stores/${editingStore.id}` : '/api/admin/stores';
      const method = editingStore ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String(
            (responsePayload as { message?: unknown } | null)?.message
            || `No se pudo ${editingStore ? 'actualizar' : 'crear'} la tienda.`,
          ),
          'error',
        );
        return;
      }

      await loadStores();
      closeModal();
      showAlert(
        `Tienda ${editingStore ? 'actualizada' : 'creada'} correctamente.`,
        'success',
      );
    } catch {
      showAlert(`No se pudo ${editingStore ? 'actualizar' : 'crear'} la tienda.`, 'error');
    } finally {
      setIsMutating(false);
    }
  }

  async function deactivateStore(store: AdminStore) {
    const accepted = await confirm({
      title: 'Desactivar tienda o almacen',
      message: `Deseas desactivar "${store.name}"?`,
      acceptText: 'Desactivar',
      cancelText: 'Cancelar',
    });

    if (!accepted) {
      return;
    }

    setIsMutating(true);
    try {
      const response = await fetch(`/api/admin/stores/${store.id}/deactivate`, {
        method: 'PATCH',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudo desactivar la tienda.'),
          'error',
        );
        return;
      }

      setStores((current) => current.map((item) => (item.id === store.id ? { ...item, isActive: false } : item)));
      showAlert(`"${store.name}" desactivada correctamente.`, 'success');
    } catch {
      showAlert('No se pudo desactivar la tienda.', 'error');
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card">
        <h1 className="section-title">Gestion de tiendas y almacenes</h1>
      </article>

      <article className="admin-card admin-filters-card-next">
        <fieldset className="admin-filters-fieldset-next">
          <legend className="admin-filters-legend-next">Filtros</legend>
          <form className="admin-filters-layout-next stores-filters-layout-next" onSubmit={onSubmitFilters}>
            <div className="admin-toolbar-join-next store-search-join-next">
              <input
                type="text"
                placeholder="Buscar nombre, codigo o direccion"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
              <button type="submit" className="admin-primary-btn" disabled={isLoading}>
                Buscar
              </button>
            </div>
            <div className="stores-inline-filters-next">
              <select
                value={filterType}
                onChange={(event) => {
                  const nextType = normalizeStoreType(event.target.value);
                  const nextValue = event.target.value ? nextType : '';
                  setFilterType(nextValue);
                  loadStores({ type: nextValue });
                }}
              >
                <option value="">Todos los tipos</option>
                <option value="STORE">Tienda</option>
                <option value="WAREHOUSE">Almacen</option>
              </select>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(event) => {
                    const nextValue = event.target.checked;
                    setIncludeInactive(nextValue);
                    loadStores({ includeInactive: nextValue });
                  }}
                />
                Incluir inactivos
              </label>
            </div>
            <div className="admin-filters-actions-next">
              <button type="button" className="admin-ghost-btn" onClick={clearFilters} disabled={isLoading}>
                Limpiar
              </button>
              <button type="button" className="admin-ghost-btn" onClick={() => loadStores()} disabled={isLoading}>
                Actualizar
              </button>
              <button type="button" className="admin-primary-btn" onClick={openCreateModal} disabled={isMutating}>
                Agregar tienda/almacen
              </button>
            </div>
          </form>
        </fieldset>

        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table list-cards-next">
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Codigo</th>
                <th>Tipo</th>
                <th>Direccion</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} data-label="Estado">
                    Cargando tiendas...
                  </td>
                </tr>
              ) : stores.length === 0 ? (
                <tr>
                  <td colSpan={7} data-label="Estado">
                    No hay tiendas para mostrar.
                  </td>
                </tr>
              ) : (
                stores.map((store, index) => (
                  <tr key={store.id}>
                    <td data-label="#">{index + 1}</td>
                    <td data-label="Nombre" className="list-card-title-next">{store.name}</td>
                    <td data-label="Codigo">{store.code}</td>
                    <td data-label="Tipo">{store.type === 'WAREHOUSE' ? 'Almacen' : 'Tienda'}</td>
                    <td data-label="Direccion">{store.address || '-'}</td>
                    <td data-label="Estado">
                      <span className={`admin-status-badge ${store.isActive ? 'success' : 'error'}`}>
                        {store.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td data-label="Accion">
                      <div className="admin-table-actions">
                        <button type="button" className="admin-ghost-btn" onClick={() => openEditModal(store)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="admin-ghost-btn"
                          onClick={() => deactivateStore(store)}
                          disabled={!store.isActive || isMutating}
                        >
                          {store.isActive ? 'Desactivar' : 'Desactivado'}
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

      {modalOpen ? (
        <div className="admin-modal-overlay" role="presentation" onClick={closeModal}>
          <article className="admin-modal-dialog" onClick={(event) => event.stopPropagation()}>
            <header className="admin-modal-head-next">
              <div>
                <h3>{editingStore ? 'Editar tienda o almacen' : 'Crear tienda o almacen'}</h3>
                <p>Completa los datos para registrar la tienda o almacen.</p>
              </div>
              <button
                type="button"
                className="admin-modal-close-next"
                onClick={closeModal}
                disabled={isMutating}
                aria-label="Cerrar modal de tienda"
              >
                x
              </button>
            </header>

            <form
              className="admin-modal-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveStore();
              }}
            >
              <label>
                <span>Nombre</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Nombre de la tienda"
                />
              </label>

              <label>
                <span>Codigo</span>
                <input
                  type="text"
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                  placeholder="Codigo unico"
                />
              </label>

              <label>
                <span>Tipo</span>
                <select
                  value={form.type}
                  onChange={(event) => setForm((current) => ({ ...current, type: normalizeStoreType(event.target.value) }))}
                >
                  <option value="STORE">Tienda</option>
                  <option value="WAREHOUSE">Almacen</option>
                </select>
              </label>

              <label>
                <span>Direccion</span>
                <textarea
                  value={form.address}
                  onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                  placeholder="Direccion de la tienda o almacen"
                  rows={3}
                />
              </label>

              <div className="admin-modal-actions">
                <button type="button" className="admin-ghost-btn" onClick={closeModal} disabled={isMutating}>
                  Cancelar
                </button>
                <button type="submit" className="admin-primary-btn" disabled={!canSave}>
                  {isMutating ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </article>
        </div>
      ) : null}
    </section>
  );
}
