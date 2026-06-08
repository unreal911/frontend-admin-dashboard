'use client';

import { FormEvent, Fragment, useEffect, useState } from 'react';
import { AdminSelect } from '@/components/admin-select';
import { useAdminUi } from '@/components/admin-ui-provider';

interface AuditActor {
  id: number | null;
  email: string | null;
  role: string | null;
}

interface AuditRequest {
  method: string;
  path: string;
  query: unknown;
  params: unknown;
  body: unknown;
}

interface AuditResponseInfo {
  statusCode: number;
  durationMs: number;
  isError: boolean;
}

interface AuditContext {
  ipAddress: string | null;
  userAgent: string | null;
}

interface AuditLogEntry {
  id: number;
  createdAt: string;
  actor: AuditActor;
  request: AuditRequest;
  response: AuditResponseInfo;
  context: AuditContext;
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface AuditLogFilters {
  search: string;
  method: string;
  statusCode: string;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const;

const DEFAULT_FILTERS: AuditLogFilters = {
  search: '',
  method: '',
  statusCode: '',
};

const DEFAULT_PAGINATION: PaginationState = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
};

function toPositiveInt(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    return fallback;
  }
  return numberValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toText(value: unknown, fallback = ''): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function toNullableText(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function toNullableInt(value: unknown): number | null {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    return null;
  }
  return numberValue;
}

function normalizePagination(payload: unknown, fallbackPage: number): PaginationState {
  const pagination = isRecord(payload) && isRecord(payload.pagination)
    ? payload.pagination
    : {};

  const page = toPositiveInt(pagination.page, fallbackPage);
  const limit = toPositiveInt(pagination.limit, DEFAULT_PAGINATION.limit);
  const total = Math.max(0, Number(pagination.total || 0));
  const totalPagesRaw = toPositiveInt(pagination.totalPages, Math.max(1, Math.ceil(total / limit)));

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, totalPagesRaw),
  };
}

function normalizeAuditLogs(payload: unknown): AuditLogEntry[] {
  const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  const logs: AuditLogEntry[] = [];

  for (const raw of data) {
    if (!isRecord(raw)) {
      continue;
    }

    const id = toPositiveInt(raw.id, 0);
    if (id < 1) {
      continue;
    }

    const actorRaw = isRecord(raw.actor) ? raw.actor : {};
    const requestRaw = isRecord(raw.request) ? raw.request : {};
    const responseRaw = isRecord(raw.response) ? raw.response : {};
    const contextRaw = isRecord(raw.context) ? raw.context : {};

    logs.push({
      id,
      createdAt: toText(raw.createdAt, ''),
      actor: {
        id: toNullableInt(actorRaw.id),
        email: toNullableText(actorRaw.email),
        role: toNullableText(actorRaw.role),
      },
      request: {
        method: toText(requestRaw.method, 'GET').toUpperCase(),
        path: toText(requestRaw.path, '/'),
        query: requestRaw.query ?? null,
        params: requestRaw.params ?? null,
        body: requestRaw.body ?? null,
      },
      response: {
        statusCode: toPositiveInt(responseRaw.statusCode, 0),
        durationMs: Math.max(0, Number(responseRaw.durationMs || 0)),
        isError: Boolean(responseRaw.isError),
      },
      context: {
        ipAddress: toNullableText(contextRaw.ipAddress),
        userAgent: toNullableText(contextRaw.userAgent),
      },
    });
  }

  return logs;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

function stringifyValue(value: unknown, pretty = false): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, pretty ? 2 : 0);
  } catch {
    return String(value);
  }
}

function previewValue(value: unknown): string {
  const text = stringifyValue(value).replace(/\s+/g, ' ').trim();
  if (!text || text === '-') {
    return '-';
  }
  if (text.length <= 88) {
    return text;
  }
  return `${text.slice(0, 88)}...`;
}

function normalizeFilters(filters: AuditLogFilters): AuditLogFilters {
  return {
    search: filters.search.trim(),
    method: filters.method.trim().toUpperCase(),
    statusCode: filters.statusCode.trim(),
  };
}

function buildQueryString(page: number, limit: number, filters: AuditLogFilters): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));

  if (filters.search) {
    params.set('search', filters.search);
  }
  if (filters.method) {
    params.set('method', filters.method);
  }
  if (filters.statusCode) {
    params.set('statusCode', filters.statusCode);
  }

  return params.toString();
}

function buildActorLabel(actor: AuditActor): string {
  if (actor.email) {
    return actor.email;
  }
  if (actor.id) {
    return `Usuario #${actor.id}`;
  }
  return 'Sistema';
}

export function AdminAuditLogsPage() {
  const { showAlert } = useAdminUi();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION);
  const [filters, setFilters] = useState<AuditLogFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AuditLogFilters>(DEFAULT_FILTERS);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  async function loadAuditLogs(page: number, nextFilters: AuditLogFilters) {
    setLoading(true);
    try {
      const query = buildQueryString(page, DEFAULT_PAGINATION.limit, nextFilters);
      const response = await fetch(`/api/admin/audit-logs?${query}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown; error?: unknown } | null)?.message
          || (payload as { error?: unknown } | null)?.error
          || 'No se pudo cargar la auditoria global.'),
          'error',
        );
        setLogs([]);
        setPagination({
          ...DEFAULT_PAGINATION,
          page,
        });
        return;
      }

      setLogs(normalizeAuditLogs(payload));
      setPagination(normalizePagination(payload, page));
      setExpandedId(null);
    } catch {
      showAlert('No se pudo consultar la auditoria global.', 'error');
      setLogs([]);
      setPagination({
        ...DEFAULT_PAGINATION,
        page,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAuditLogs(1, DEFAULT_FILTERS);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextFilters = normalizeFilters(filters);
    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
    loadAuditLogs(1, nextFilters);
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    loadAuditLogs(1, DEFAULT_FILTERS);
  }

  function goToPage(nextPage: number) {
    const safePage = Math.max(1, Math.min(nextPage, pagination.totalPages));
    if (safePage === pagination.page) {
      return;
    }
    loadAuditLogs(safePage, appliedFilters);
  }

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card">
        <h1>Auditoria global</h1>
        <p>Registro de requests del panel admin para trazabilidad tecnica y soporte.</p>
      </article>

      <article className="admin-card">
        <form className="admin-toolbar admin-toolbar-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Buscar por ruta, metodo, email o rol"
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          />
          <AdminSelect
            value={filters.method}
            options={[
              { value: '', label: 'Todos los metodos' },
              ...HTTP_METHODS.map((method) => ({ value: method, label: method })),
            ]}
            ariaLabel="Filtrar auditoria por metodo HTTP"
            onChange={(nextValue) => setFilters((current) => ({ ...current, method: nextValue }))}
          />
          <input
            type="number"
            min={100}
            max={599}
            placeholder="Status"
            value={filters.statusCode}
            onChange={(event) => setFilters((current) => ({ ...current, statusCode: event.target.value }))}
          />
          <button type="submit" className="admin-primary-btn" disabled={loading}>
            Buscar
          </button>
          <button type="button" className="admin-ghost-btn" onClick={clearFilters} disabled={loading}>
            Limpiar
          </button>
        </form>

        <p className="admin-muted-text">
          Mostrando {logs.length} registro(s) de {pagination.total}.
        </p>

        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Actor</th>
                <th>Request</th>
                <th>Estado</th>
                <th>Duracion</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} data-label="Estado">
                    Cargando trazabilidad...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} data-label="Estado">
                    No hay registros de auditoria para los filtros actuales.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isExpanded = expandedId === log.id;
                  return (
                    <Fragment key={log.id}>
                      <tr>
                        <td data-label="Fecha">{formatDate(log.createdAt)}</td>
                        <td data-label="Actor">
                          <div>
                            <strong>{buildActorLabel(log.actor)}</strong>
                            <br />
                            <small>{log.actor.role || 'Rol no definido'}</small>
                          </div>
                        </td>
                        <td data-label="Request">
                          <div>
                            <span className="admin-code-line">{log.request.method}</span>
                            <br />
                            <small>{log.request.path}</small>
                          </div>
                        </td>
                        <td data-label="Estado">
                          <span className={`admin-pill ${log.response.isError ? 'error' : 'success'}`}>
                            {log.response.statusCode || '-'}
                          </span>
                        </td>
                        <td data-label="Duracion">{Math.round(log.response.durationMs)} ms</td>
                        <td data-label="Accion">
                          <div className="admin-table-actions">
                            <button
                              type="button"
                              className="admin-ghost-btn"
                              onClick={() => setExpandedId(isExpanded ? null : log.id)}
                            >
                              {isExpanded ? 'Ocultar' : 'Ver payload'}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr>
                          <td colSpan={6} data-label="">
                            <div className="admin-json-grid">
                              <div>
                                <strong>Query</strong>
                                <p>{previewValue(log.request.query)}</p>
                              </div>
                              <div>
                                <strong>Params</strong>
                                <p>{previewValue(log.request.params)}</p>
                              </div>
                              <div>
                                <strong>Body</strong>
                                <pre>{stringifyValue(log.request.body, true)}</pre>
                              </div>
                              <div>
                                <strong>Contexto</strong>
                                <pre>{stringifyValue(log.context, true)}</pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-pagination">
          <button
            type="button"
            className="admin-ghost-btn"
            onClick={() => goToPage(pagination.page - 1)}
            disabled={loading || pagination.page <= 1}
          >
            Anterior
          </button>
          <p>
            Pagina {pagination.page} de {pagination.totalPages}
          </p>
          <button
            type="button"
            className="admin-ghost-btn"
            onClick={() => goToPage(pagination.page + 1)}
            disabled={loading || pagination.page >= pagination.totalPages}
          >
            Siguiente
          </button>
        </div>
      </article>
    </section>
  );
}
