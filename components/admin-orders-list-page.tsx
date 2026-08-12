'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { ADMIN_LIVE_UPDATE_EVENT } from '@/components/admin-shell-provider';
import { AdminSelect } from '@/components/admin-select';
import { AdminButton } from '@/components/admin-design-system';
import { AdminTableEmptyState } from '@/components/admin-table-empty-state';
import {
  AdminOrder,
  AdminOrderStatus,
  normalizeOrdersListResponse,
} from '@/lib/admin-order-types';

type AdminOrderChannel = 'POS' | 'ECOMMERCE' | 'INTERNAL';

interface FiltersState {
  search: string;
  channel: '' | AdminOrderChannel;
  status: '' | AdminOrderStatus;
  storeId: '' | number;
  startDate: string;
  endDate: string;
}

interface QuickStatusOption {
  value: AdminOrderStatus;
  label: string;
}

const STATUS_OPTIONS: Array<{ value: '' | AdminOrderStatus; label: string }> = [
  { value: '', label: 'Todos los estados' },
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'CONFIRMED', label: 'Confirmado' },
  { value: 'WAITING_TRANSFER', label: 'Esperando transferencia' },
  { value: 'PREPARING', label: 'Preparando' },
  { value: 'READY', label: 'Listo' },
  { value: 'DELIVERED', label: 'Entregado' },
  { value: 'RETURN_PENDING', label: 'Pendiente devolucion' },
  { value: 'CANCELLED', label: 'Cancelado' },
  { value: 'WAITING_STOCK', label: 'Sin stock' },
];

const CHANNEL_OPTIONS: Array<{ value: '' | AdminOrderChannel; label: string }> = [
  { value: '', label: 'Todos los canales' },
  { value: 'POS', label: 'POS' },
  { value: 'ECOMMERCE', label: 'Ecommerce' },
  { value: 'INTERNAL', label: 'Interno' },
];

const QUICK_STATUS_OPTIONS: QuickStatusOption[] = [
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'CONFIRMED', label: 'Confirmado' },
  { value: 'PREPARING', label: 'Preparando' },
];

const ORDER_STATUS_COLORS: Record<AdminOrderStatus, string> = {
  PENDING: '#f39c12',
  CONFIRMED: '#3498db',
  WAITING_TRANSFER: '#9b59b6',
  PREPARING: '#e67e22',
  READY: '#27ae60',
  DELIVERED: '#16a085',
  RETURN_PENDING: '#d35400',
  CANCELLED: '#e74c3c',
  WAITING_STOCK: '#c0392b',
};

const ORDER_STATUS_LABELS: Record<AdminOrderStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmado',
  WAITING_TRANSFER: 'Esperando transferencia',
  PREPARING: 'Preparando',
  READY: 'Listo',
  DELIVERED: 'Entregado',
  RETURN_PENDING: 'Pendiente devolucion',
  CANCELLED: 'Cancelado',
  WAITING_STOCK: 'Sin stock',
};

const PAGE_SIZE = 10;

function toOrderStatusFilter(value: string | null): '' | AdminOrderStatus {
  const normalized = String(value || '').trim().toUpperCase() as AdminOrderStatus;
  return STATUS_OPTIONS.some((option) => option.value === normalized) ? normalized : '';
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatMoney(value: number): string {
  const amount = Number(value || 0);
  return `S/ ${amount.toFixed(2)}`;
}

function getStatusLabel(status: string): string {
  const normalized = String(status || '').toUpperCase() as AdminOrderStatus;
  return ORDER_STATUS_LABELS[normalized] || status || '-';
}

function getChannelLabel(channel: string): string {
  const normalized = String(channel || '').toUpperCase();
  if (normalized === 'POS') return 'POS';
  if (normalized === 'ECOMMERCE') return 'Ecommerce';
  if (normalized === 'INTERNAL') return 'Interno';
  return 'No definido';
}

function buildOrdersQuery(page: number, filters: FiltersState) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(PAGE_SIZE),
  });

  if (filters.search.trim()) {
    params.set('search', filters.search.trim());
  }
  if (filters.channel) {
    params.set('channel', filters.channel);
  }
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.storeId) {
    params.set('storeId', String(filters.storeId));
  }
  if (filters.startDate) {
    params.set('startDate', filters.startDate);
  }
  if (filters.endDate) {
    params.set('endDate', filters.endDate);
  }

  return params.toString();
}

function getResponsibleLabel(order: AdminOrder): string {
  const responsible = order.primaryResponsible;
  if (!responsible) {
    return 'Sin asignar';
  }
  const fullName = `${responsible.firstName || ''} ${responsible.lastName || ''}`.trim() || 'Sin nombre';
  const role = String(responsible.role || '').toUpperCase();
  if (role === 'SELLER') return `${fullName} (Vendedor)`;
  if (role === 'PICKER') return `${fullName} (Picker)`;
  if (role === 'DISPENSER') return `${fullName} (Despachador)`;
  return fullName;
}

export function AdminOrdersListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = useAdminAuth();

  const [stores, setStores] = useState<Array<{ id: number; name: string }>>([]);
  const [filterDraft, setFilterDraft] = useState<FiltersState>({
    search: '',
    channel: '',
    status: '',
    storeId: '',
    startDate: '',
    endDate: '',
  });
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>({
    search: '',
    channel: '',
    status: '',
    storeId: '',
    startDate: '',
    endDate: '',
  });

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [quickStatusCounts, setQuickStatusCounts] = useState<Record<AdminOrderStatus, number>>({
    PENDING: 0,
    CONFIRMED: 0,
    PREPARING: 0,
    WAITING_TRANSFER: 0,
    READY: 0,
    DELIVERED: 0,
    RETURN_PENDING: 0,
    CANCELLED: 0,
    WAITING_STOCK: 0,
  });
  const canViewOrderDetail = hasPermission('orders.detail.view');

  const activeFilterTags = useMemo(() => {
    const tags: Array<{ key: keyof FiltersState; label: string; value: string }> = [];
    if (appliedFilters.search.trim()) {
      tags.push({ key: 'search', label: 'Buscar', value: appliedFilters.search.trim() });
    }
    if (appliedFilters.channel) {
      tags.push({ key: 'channel', label: 'Canal', value: getChannelLabel(appliedFilters.channel) });
    }
    if (appliedFilters.status) {
      tags.push({ key: 'status', label: 'Estado', value: getStatusLabel(appliedFilters.status) });
    }
    if (appliedFilters.storeId) {
      const store = stores.find((item) => item.id === appliedFilters.storeId);
      tags.push({ key: 'storeId', label: 'Tienda', value: store?.name || `ID ${appliedFilters.storeId}` });
    }
    if (appliedFilters.startDate) {
      tags.push({ key: 'startDate', label: 'Desde', value: appliedFilters.startDate });
    }
    if (appliedFilters.endDate) {
      tags.push({ key: 'endDate', label: 'Hasta', value: appliedFilters.endDate });
    }
    return tags;
  }, [appliedFilters, stores]);

  const hasActiveFilters = activeFilterTags.length > 0;
  const activeFilterCount = activeFilterTags.length;

  const loadOrders = useCallback(async (page: number, filters: FiltersState, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setLoadError('');
    try {
      const query = buildOrdersQuery(page, filters);
      const response = await fetch(`/api/admin/orders?${query}`, {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudieron cargar las ordenes.');
        setLoadError(message);
        setOrders([]);
        return;
      }

      const normalized = normalizeOrdersListResponse(payload);
      setOrders(normalized.data);
      setTotalOrders(normalized.pagination.total);
      setTotalPages(Math.max(1, normalized.pagination.totalPages));
    } catch {
      setLoadError('No se pudieron cargar las ordenes.');
      setOrders([]);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  const loadStores = useCallback(async () => {
    const response = await fetch('/api/admin/stores?skip=1&take=120', {
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

    const data = Array.isArray(payload)
      ? payload
      : (Array.isArray((payload as { data?: unknown[] } | null)?.data) ? (payload as { data: unknown[] }).data : []);

    const normalized = data
      .map((item) => ({
        id: Number((item as { id?: unknown }).id || 0),
        name: String((item as { name?: unknown }).name || '').trim(),
      }))
      .filter((item) => Number.isInteger(item.id) && item.id > 0 && item.name);

    setStores(normalized);
  }, []);

  const loadQuickStatusCounts = useCallback(async (filters: FiltersState) => {
    const baseFilters: FiltersState = { ...filters, status: '' };

    const counts: Record<AdminOrderStatus, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      PREPARING: 0,
      WAITING_TRANSFER: 0,
      READY: 0,
      DELIVERED: 0,
      RETURN_PENDING: 0,
      CANCELLED: 0,
      WAITING_STOCK: 0,
    };

    await Promise.all(QUICK_STATUS_OPTIONS.map(async (statusOption) => {
      const query = buildOrdersQuery(1, { ...baseFilters, status: statusOption.value });
      const response = await fetch(`/api/admin/orders?${query}`, {
        method: 'GET',
        cache: 'no-store',
      }).catch(() => null);
      if (!response) {
        return;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return;
      }
      const normalized = normalizeOrdersListResponse(payload);
      counts[statusOption.value] = normalized.pagination.total;
    }));

    setQuickStatusCounts((current) => ({ ...current, ...counts }));
  }, []);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    const nextFilters: FiltersState = {
      search: String(searchParams.get('search') || '').trim(),
      channel: String(searchParams.get('channel') || '').toUpperCase() as FiltersState['channel'],
      status: toOrderStatusFilter(searchParams.get('status')),
      storeId: '',
      startDate: String(searchParams.get('startDate') || ''),
      endDate: String(searchParams.get('endDate') || ''),
    };
    const storeId = Number(searchParams.get('storeId') || 0);
    if (Number.isInteger(storeId) && storeId > 0) {
      nextFilters.storeId = storeId;
    }
    if (!CHANNEL_OPTIONS.some((option) => option.value === nextFilters.channel)) {
      nextFilters.channel = '';
    }
    setFilterDraft(nextFilters);
    setAppliedFilters(nextFilters);
    setCurrentPage(1);
  }, [searchParams]);

  useEffect(() => {
    loadOrders(currentPage, appliedFilters);
  }, [appliedFilters, currentPage, loadOrders]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    let refreshTimer: number | null = null;
    const refresh = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(() => {
        void loadOrders(currentPage, appliedFilters, { silent: true });
        void loadQuickStatusCounts(appliedFilters);
      }, 150);
    };

    window.addEventListener(ADMIN_LIVE_UPDATE_EVENT, refresh);
    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      window.removeEventListener(ADMIN_LIVE_UPDATE_EVENT, refresh);
    };
  }, [appliedFilters, currentPage, loadOrders, loadQuickStatusCounts]);

  useEffect(() => {
    loadQuickStatusCounts(appliedFilters);
  }, [appliedFilters, loadQuickStatusCounts]);

  useEffect(() => {
    if (!showFiltersModal) {
      return undefined;
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowFiltersModal(false);
      }
    };

    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
    };
  }, [showFiltersModal]);

  function applyFilters() {
    setCurrentPage(1);
    setAppliedFilters(filterDraft);
  }

  function clearFilters() {
    const reset: FiltersState = {
      search: '',
      channel: '',
      status: '',
      storeId: '',
      startDate: '',
      endDate: '',
    };
    setFilterDraft(reset);
    setCurrentPage(1);
    setAppliedFilters(reset);
  }

  function openFiltersModal() {
    setShowFiltersModal(true);
  }

  function closeFiltersModal() {
    setShowFiltersModal(false);
  }

  function applyFiltersFromModal() {
    applyFilters();
    closeFiltersModal();
  }

  function clearFiltersFromModal() {
    clearFilters();
    closeFiltersModal();
  }

  function removeFilter(key: keyof FiltersState) {
    setFilterDraft((current) => ({ ...current, [key]: key === 'storeId' ? '' : '' }));
    setAppliedFilters((current) => ({ ...current, [key]: key === 'storeId' ? '' : '' }));
    setCurrentPage(1);
  }

  function applyQuickStatus(status: AdminOrderStatus) {
    const nextStatus = String(filterDraft.status || '').toUpperCase() === status ? '' : status;
    const nextFilters: FiltersState = { ...filterDraft, status: nextStatus as FiltersState['status'] };
    setFilterDraft(nextFilters);
    setAppliedFilters(nextFilters);
    setCurrentPage(1);
  }

  function isQuickStatusSelected(status: AdminOrderStatus): boolean {
    return String(filterDraft.status || '').toUpperCase() === status;
  }

  function getQuickStatusCount(status: AdminOrderStatus): number {
    return Number(quickStatusCounts[status] || 0);
  }

  function printOrder(order: AdminOrder) {
    if (typeof window === 'undefined') {
      return;
    }
    window.open(`/admin/orders/${order.id}?print=1`, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="admin-dashboard-grid orders-container-next">
      <article className="admin-card orders-header-card-next">
        <div className="orders-header-next">
          <h1>Gestion de ordenes</h1>
          <p>Visualiza y gestiona todos los pedidos del sistema.</p>
        </div>
        <span className="orders-header-summary-next" aria-live="polite">
          {loading ? 'Actualizando...' : `${totalOrders} ${totalOrders === 1 ? 'orden' : 'ordenes'}`}
        </span>
      </article>

      <article className="admin-card orders-filters-shell-next">
        <div className="orders-filters-toolbar-next">
          <div className="orders-filters-toolbar-copy-next">
            <h2>Filtros</h2>
            <p>Filtra por estado o abre la busqueda avanzada.</p>
          </div>
          <AdminButton type="button" variant="secondary" className="orders-open-filters-btn-next" onClick={openFiltersModal}>
            <svg className="orders-filter-icon-next" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            <span>Filtros</span>
            {activeFilterCount > 0 ? <span className="orders-open-filters-count-next">{activeFilterCount}</span> : null}
          </AdminButton>
        </div>

        <div className="quick-status-section-next">
          <span className="quick-status-title-next">Filtros rapidos</span>
          <div className="quick-status-list-next" role="group" aria-label="Filtrar rápidamente por estado">
            {QUICK_STATUS_OPTIONS.map((status) => (
              <button
                key={status.value}
                type="button"
                className={`quick-status-badge-next ${isQuickStatusSelected(status.value) ? 'active' : ''}`}
                aria-pressed={isQuickStatusSelected(status.value)}
                onClick={() => applyQuickStatus(status.value)}
              >
                <span>{status.label}</span>
                <span className="quick-status-count-next">{getQuickStatusCount(status.value)}</span>
              </button>
            ))}
          </div>
        </div>

        {hasActiveFilters ? (
          <div className="active-filters-next">
            {activeFilterTags.map((tag) => (
              <button key={tag.key} type="button" className="active-filter-chip-next" onClick={() => removeFilter(tag.key)}>
                <span className="active-filter-label-next">{tag.label}:</span>
                <span>{tag.value}</span>
                <span className="active-filter-remove-next" aria-hidden="true">x</span>
              </button>
            ))}
            <button type="button" className="active-filters-clear-next" onClick={clearFilters}>Limpiar todo</button>
          </div>
        ) : null}
      </article>

      {showFiltersModal ? (
        <div className="orders-filters-modal-overlay-next" onClick={closeFiltersModal}>
          <section
            className="orders-filters-modal-next"
            role="dialog"
            aria-modal="true"
            aria-label="Filtros de ordenes"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="orders-filters-modal-header-next">
              <div>
                <h3>Filtrar ordenes</h3>
                <p>Busca por cliente, canal, estado, tienda o fechas.</p>
              </div>
              <button
                type="button"
                className="orders-filters-modal-close-next"
                onClick={closeFiltersModal}
                aria-label="Cerrar filtros"
              >
                x
              </button>
            </header>

            <div className="orders-filters-modal-body-next">
              <div className="orders-filters-grid-next">
                <label className="inventory-field orders-filter-field-full-next">
                  <span>Buscar</span>
                  <input
                    type="text"
                    value={filterDraft.search}
                    onChange={(event) => setFilterDraft((current) => ({ ...current, search: event.target.value }))}
                    placeholder="Codigo, cliente, correo o telefono"
                  />
                </label>
                <div className="inventory-field">
                  <span>Canal</span>
                  <AdminSelect
                    value={filterDraft.channel}
                    options={CHANNEL_OPTIONS}
                    ariaLabel="Filtrar ordenes por canal"
                    onChange={(nextValue) => setFilterDraft((current) => ({ ...current, channel: nextValue as FiltersState['channel'] }))}
                  />
                </div>
                <div className="inventory-field">
                  <span>Estado</span>
                  <AdminSelect
                    value={filterDraft.status}
                    options={STATUS_OPTIONS}
                    ariaLabel="Filtrar ordenes por estado"
                    onChange={(nextValue) => setFilterDraft((current) => ({ ...current, status: nextValue as FiltersState['status'] }))}
                  />
                </div>
                <div className="inventory-field">
                  <span>Tienda</span>
                  <AdminSelect
                    value={String(filterDraft.storeId)}
                    options={[
                      { value: '', label: 'Todas las tiendas' },
                      ...stores.map((store) => ({ value: String(store.id), label: store.name })),
                    ]}
                    ariaLabel="Filtrar ordenes por tienda"
                    onChange={(nextValue) => {
                      const numeric = Number(nextValue);
                      setFilterDraft((current) => ({
                        ...current,
                        storeId: Number.isInteger(numeric) && numeric > 0 ? numeric : '',
                      }));
                    }}
                  />
                </div>
                <label className="inventory-field">
                  <span>Desde</span>
                  <input
                    type="date"
                    value={filterDraft.startDate}
                    onChange={(event) => setFilterDraft((current) => ({ ...current, startDate: event.target.value }))}
                  />
                </label>
                <label className="inventory-field">
                  <span>Hasta</span>
                  <input
                    type="date"
                    value={filterDraft.endDate}
                    onChange={(event) => setFilterDraft((current) => ({ ...current, endDate: event.target.value }))}
                  />
                </label>
              </div>

              <div className="orders-filters-modal-actions-next">
                <button type="button" className="admin-ghost-btn" onClick={clearFiltersFromModal}>Limpiar</button>
                <button type="button" className="admin-primary-btn" onClick={applyFiltersFromModal}>Aplicar filtros</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <article className="admin-card orders-table-section-next">
        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table ops-cards-next">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Cliente</th>
                <th>Canal</th>
                <th>Estado</th>
                <th>Tienda</th>
                <th>Responsable</th>
                <th>Total</th>
                <th>Creado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="orders-feedback-cell-next">Cargando ordenes...</td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={9} className="orders-feedback-cell-next">{loadError}</td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <AdminTableEmptyState
                    colSpan={9}
                    title={hasActiveFilters ? 'No encontramos ordenes' : 'Aun no hay ordenes'}
                    description={hasActiveFilters
                      ? 'Prueba cambiando o eliminando los filtros aplicados.'
                      : 'Las nuevas ventas apareceran aqui para su seguimiento.'}
                    action={hasActiveFilters ? (
                      <button type="button" className="admin-ghost-btn" onClick={clearFilters}>
                        Limpiar filtros
                      </button>
                    ) : null}
                  />
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="orders-row-next">
                    <td data-label="Codigo" className="orders-code-next list-card-title-next"><strong>{order.code}</strong></td>
                    <td data-label="Cliente">{order.clientName || order.clientEmail || 'Sin cliente'}</td>
                    <td data-label="Canal" className="ops-hide-mobile">{getChannelLabel(order.salesChannel)}</td>
                    <td data-label="Estado" className="ops-status-next">
                      <span className="orders-status-pill-next" style={{ backgroundColor: ORDER_STATUS_COLORS[order.status] || '#95a5a6' }}>
                        {getStatusLabel(order.status)}
                      </span>
                    </td>
                    <td data-label="Tienda">{order.sourceStore?.name || '-'}</td>
                    <td data-label="Responsable" className="ops-hide-mobile">{getResponsibleLabel(order)}</td>
                    <td data-label="Total" className="orders-money-cell-next">{formatMoney(order.total)}</td>
                    <td data-label="Creado">{formatDateTime(order.createdAt)}</td>
                    <td data-label="Accion">
                      <div className="admin-table-actions">
                        {canViewOrderDetail ? (
                          <>
                            <button type="button" className="admin-ghost-btn" onClick={() => router.push(`/admin/orders/${order.id}`)}>
                              Ver
                            </button>
                            <button type="button" className="admin-ghost-btn orders-print-btn-next" onClick={() => printOrder(order)}>
                              Imprimir
                            </button>
                          </>
                        ) : (
                          <span className="admin-muted-text">Sin permiso de detalle</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {!loading && !loadError && orders.length > 0 ? (
        <article className="admin-card">
          <div className="admin-pagination">
            <button
              type="button"
              className="admin-ghost-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
            >
              Anterior
            </button>
            <p>Pagina {currentPage} de {totalPages} ({totalOrders} ordenes)</p>
            <button
              type="button"
              className="admin-ghost-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))}
            >
              Siguiente
            </button>
          </div>
        </article>
      ) : null}
    </section>
  );
}
