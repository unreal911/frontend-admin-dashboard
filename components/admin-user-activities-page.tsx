'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminSelect } from '@/components/admin-select';
import { useAdminUi } from '@/components/admin-ui-provider';

interface UserActivityProduct {
  variantId: number;
  sku: string | null;
  productName: string | null;
  color: string | null;
  size: string | null;
  quantity: number | null;
}

interface UserActivityEntry {
  id: number;
  createdAt: string;
  user: {
    id: number | null;
    email: string | null;
    role: string | null;
  };
  module: string;
  actionType: string;
  actionLabel: string;
  entity: {
    type: string;
    id: number | null;
    code: string | null;
  };
  description: string | null;
  products: UserActivityProduct[];
  context: Record<string, unknown>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UserActivityResponse {
  data?: UserActivityEntry[];
  pagination?: Partial<Pagination>;
}

const DEFAULT_PAGINATION: Pagination = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

function normalizeUserActivitiesResponse(payload: unknown, fallbackPage: number, fallbackLimit: number) {
  const data = Array.isArray((payload as UserActivityResponse | null)?.data)
    ? (payload as UserActivityResponse).data as UserActivityEntry[]
    : [];
  const paginationRaw = (payload as UserActivityResponse | null)?.pagination || {};
  const pagination: Pagination = {
    page: Number(paginationRaw.page || fallbackPage || 1),
    limit: Number(paginationRaw.limit || fallbackLimit || 20),
    total: Number(paginationRaw.total || 0),
    totalPages: Number(
      paginationRaw.totalPages
      || Math.ceil(Number(paginationRaw.total || 0) / Math.max(Number(paginationRaw.limit || fallbackLimit || 20), 1)),
    ),
  };
  return { data, pagination };
}

function formatDateTime(value: string): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString('es-PE');
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AdminUserActivitiesPage() {
  const { showAlert } = useAdminUi();
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<UserActivityEntry[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<UserActivityEntry | null>(null);
  const [pagination, setPagination] = useState<Pagination>(DEFAULT_PAGINATION);

  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [actionType, setActionType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const moduleOptions = ['INVENTORY', 'TRANSFERS', 'PICKING', 'POS', 'ORDERS', 'GENERAL'];

  const fromItem = useMemo(() => {
    if (pagination.total === 0) {
      return 0;
    }
    return (pagination.page - 1) * pagination.limit + 1;
  }, [pagination]);

  const toItem = useMemo(() => {
    return Math.min(pagination.total, pagination.page * pagination.limit);
  }, [pagination]);

  useEffect(() => {
    loadActivities(1);
  }, []);

  function buildQuery(page: number, limit: number): string {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    const normalizedSearch = search.trim();
    const normalizedModule = moduleName.trim().toUpperCase();
    const normalizedActionType = actionType.trim().toUpperCase();
    const normalizedEntityType = entityType.trim().toUpperCase();
    const normalizedStartDate = startDate.trim();
    const normalizedEndDate = endDate.trim();
    const userIdValue = Number(userId.trim());

    if (normalizedSearch) {
      params.set('search', normalizedSearch);
    }
    if (normalizedModule) {
      params.set('module', normalizedModule);
    }
    if (normalizedActionType) {
      params.set('actionType', normalizedActionType);
    }
    if (normalizedEntityType) {
      params.set('entityType', normalizedEntityType);
    }
    if (normalizedStartDate) {
      params.set('startDate', normalizedStartDate);
    }
    if (normalizedEndDate) {
      params.set('endDate', normalizedEndDate);
    }
    if (userId.trim() && Number.isInteger(userIdValue) && userIdValue > 0) {
      params.set('userId', String(userIdValue));
    }

    return params.toString();
  }

  async function loadActivities(nextPage = pagination.page, nextLimit = pagination.limit) {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/user-activities?${buildQuery(nextPage, nextLimit)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { error?: unknown; message?: unknown } | null)?.error
            || (payload as { error?: unknown; message?: unknown } | null)?.message
            || 'No se pudo cargar la auditoria de movimientos.'),
          'error',
          3500,
        );
        return;
      }

      const normalized = normalizeUserActivitiesResponse(payload, nextPage, nextLimit);
      setActivities(normalized.data);
      setPagination(normalized.pagination);
    } catch {
      showAlert('No se pudo cargar la auditoria de movimientos.', 'error', 3500);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    loadActivities(1, pagination.limit);
  }

  function clearFilters() {
    setSearch('');
    setUserId('');
    setModuleName('');
    setActionType('');
    setEntityType('');
    setStartDate('');
    setEndDate('');
    setTimeout(() => loadActivities(1, pagination.limit), 0);
  }

  function goPreviousPage() {
    if (pagination.page <= 1 || loading) {
      return;
    }
    loadActivities(pagination.page - 1, pagination.limit);
  }

  function goNextPage() {
    if (pagination.page >= Math.max(pagination.totalPages, 1) || loading) {
      return;
    }
    loadActivities(pagination.page + 1, pagination.limit);
  }

  function getUserLabel(activity: UserActivityEntry): string {
    const email = String(activity?.user?.email || '').trim();
    if (email.length > 0) {
      return email;
    }

    const normalizedUserId = Number(activity?.user?.id || 0);
    if (Number.isInteger(normalizedUserId) && normalizedUserId > 0) {
      return `Usuario #${normalizedUserId}`;
    }
    return 'Sistema';
  }

  function getEntityLabel(activity: UserActivityEntry): string {
    const code = String(activity?.entity?.code || '').trim();
    if (code.length > 0) {
      return code;
    }
    const entityId = Number(activity?.entity?.id || 0);
    if (Number.isInteger(entityId) && entityId > 0) {
      return `${activity?.entity?.type || 'ENTIDAD'} #${entityId}`;
    }
    return activity?.entity?.type || '-';
  }

  function getProductSummary(activity: UserActivityEntry): string {
    const products = Array.isArray(activity?.products) ? activity.products : [];
    if (products.length === 0) {
      return '-';
    }
    const first = products[0];
    const firstName = first?.productName || first?.sku || `Variante #${first?.variantId || '-'}`;
    if (products.length === 1) {
      return firstName;
    }
    return `${firstName} +${products.length - 1}`;
  }

  return (
    <section className="user-activity-page">
      <article className="admin-card activity-header">
        <div>
          <p className="activity-kicker">Auditoria operativa</p>
          <h1 className="activity-title">Movimientos de usuarios</h1>
          <p className="activity-subtitle">
            Seguimiento de acciones por usuario: inventario, picking, traslados, POS y ordenes.
          </p>
        </div>
        <div className="activity-header-actions">
          <button type="button" className="admin-ghost-btn" onClick={() => loadActivities()} disabled={loading}>
            Actualizar
          </button>
        </div>
      </article>

      <article className="activity-filters">
        <div className="activity-filters-grid">
          <label>
            <span>Buscar</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Usuario, accion, entidad o detalle"
            />
          </label>

          <label>
            <span>Usuario ID</span>
            <input
              type="number"
              min={1}
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="Ej. 7"
            />
          </label>

          <div className="admin-field-block">
            <span>Modulo</span>
            <AdminSelect
              value={moduleName}
              options={[
                { value: '', label: 'Todos' },
                ...moduleOptions.map((moduleItem) => ({ value: moduleItem, label: moduleItem })),
              ]}
              ariaLabel="Filtrar actividades por modulo"
              onChange={setModuleName}
            />
          </div>

          <label>
            <span>Tipo de accion</span>
            <input
              type="text"
              value={actionType}
              onChange={(event) => setActionType(event.target.value)}
              placeholder="PICKING_COMPLETED"
            />
          </label>

          <label>
            <span>Tipo de entidad</span>
            <input
              type="text"
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
              placeholder="ORDER, TRANSFER, ..."
            />
          </label>

          <label>
            <span>Desde</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>

          <label>
            <span>Hasta</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>

        <div className="activity-filter-actions">
          <button type="button" className="admin-primary-btn" onClick={applyFilters} disabled={loading}>Filtrar</button>
          <button type="button" className="admin-ghost-btn" onClick={clearFilters} disabled={loading}>Limpiar</button>
        </div>
      </article>

      <p className="activity-summary">
        Mostrando <strong>{fromItem}</strong> a <strong>{toItem}</strong> de <strong>{pagination.total}</strong> movimientos.
      </p>

      <div className="activity-table-wrapper admin-table-wrap">
        <table className="admin-table mobile-card-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Modulo</th>
              <th>Accion</th>
              <th>Entidad</th>
              <th>Productos</th>
              <th>Detalle</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} data-label="Estado">Cargando movimientos...</td>
              </tr>
            ) : activities.length === 0 ? (
              <tr>
                <td colSpan={9} data-label="Estado">No hay movimientos para los filtros aplicados.</td>
              </tr>
            ) : (
              activities.map((activity) => (
                <tr key={activity.id}>
                  <td data-label="#">{activity.id}</td>
                  <td data-label="Fecha">{formatDateTime(activity.createdAt)}</td>
                  <td data-label="Usuario">{getUserLabel(activity)}</td>
                  <td data-label="Modulo"><span className="admin-status-badge info">{activity.module}</span></td>
                  <td data-label="Accion">{activity.actionLabel}</td>
                  <td data-label="Entidad">{getEntityLabel(activity)}</td>
                  <td data-label="Productos">{getProductSummary(activity)}</td>
                  <td data-label="Detalle">{activity.description || '-'}</td>
                  <td data-label="Accion">
                    <button type="button" className="admin-ghost-btn" onClick={() => setSelectedActivity(activity)}>
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="activity-pagination">
        <button type="button" className="admin-ghost-btn" onClick={goPreviousPage} disabled={loading || pagination.page <= 1}>
          Anterior
        </button>
        <span>Pagina {pagination.page} de {Math.max(pagination.totalPages, 1)}</span>
        <button
          type="button"
          className="admin-ghost-btn"
          onClick={goNextPage}
          disabled={loading || pagination.page >= Math.max(pagination.totalPages, 1)}
        >
          Siguiente
        </button>
      </div>

      {selectedActivity ? (
        <>
          <div className="admin-confirm-overlay audit-modal-backdrop" onClick={() => setSelectedActivity(null)} />
          <section className="activity-details-modal" role="dialog" aria-modal="true">
            <div className="activity-details-header">
              <div>
                <h2>Movimiento #{selectedActivity.id}</h2>
                <p>{formatDateTime(selectedActivity.createdAt)}</p>
              </div>
              <button
                className="admin-modal-close-next"
                type="button"
                onClick={() => setSelectedActivity(null)}
                aria-label="Cerrar detalle de movimiento"
              >
                x
              </button>
            </div>

            <div className="activity-details-grid">
              <div>
                <p className="activity-details-label">Usuario</p>
                <p>{getUserLabel(selectedActivity)}</p>
                <p>{selectedActivity.user.role || '-'}</p>
              </div>
              <div>
                <p className="activity-details-label">Modulo y accion</p>
                <p><strong>{selectedActivity.module}</strong></p>
                <p>{selectedActivity.actionLabel}</p>
                <p>{selectedActivity.actionType}</p>
              </div>
              <div>
                <p className="activity-details-label">Entidad</p>
                <p>{getEntityLabel(selectedActivity)}</p>
                <p>{selectedActivity.entity.type}</p>
              </div>
              <div>
                <p className="activity-details-label">Descripcion</p>
                <p>{selectedActivity.description || '-'}</p>
              </div>
            </div>

            <div className="activity-products-block">
              <h3>Productos involucrados</h3>
              {selectedActivity.products.length === 0 ? (
                <p>No se registraron productos en esta accion.</p>
              ) : (
                <div className="activity-product-list">
                  {selectedActivity.products.map((product, index) => (
                    <article key={`${product.variantId}-${product.sku || index}`} className="activity-product-card">
                      <div className="activity-product-text">
                        <p className="activity-product-name">{product.productName || `Variante #${product.variantId || '-'}`}</p>
                        <p className="activity-product-meta">{product.color || 'Sin color'} / {product.size || 'Sin talla'}</p>
                        <p className="activity-product-sku">{product.sku || '-'}</p>
                      </div>
                      <span className="admin-status-badge info">x{product.quantity || 0}</span>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="activity-context-block">
              <p className="activity-details-label">Contexto tecnico</p>
              <pre>{formatJson(selectedActivity.context)}</pre>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
