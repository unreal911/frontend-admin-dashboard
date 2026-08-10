'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminSelect, AdminSelectOption } from '@/components/admin-select';
import { useAdminUi } from '@/components/admin-ui-provider';
import {
  InventoryReservation,
  InventoryReservationStatus,
  normalizeReservations,
} from '@/lib/admin-inventory-types';

type ReservationStatusFilter = 'ALL' | InventoryReservationStatus;

const ALLOWED_STATUS: ReservationStatusFilter[] = ['ALL', 'ACTIVE', 'RELEASED', 'COMPLETED'];

const RESERVATION_STATUS_OPTIONS: AdminSelectOption<ReservationStatusFilter>[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'ACTIVE', label: 'Activa' },
  { value: 'RELEASED', label: 'Liberada' },
  { value: 'COMPLETED', label: 'Completada' },
];

function parseInventoryId(value: string | null): number | null {
  const parsed = Number(value || 0);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function getReservationStatusLabel(status: InventoryReservationStatus): string {
  const labels: Record<InventoryReservationStatus, string> = {
    ACTIVE: 'Activa',
    RELEASED: 'Liberada',
    COMPLETED: 'Completada',
  };
  return labels[status] || status;
}

function getReservationStatusTone(status: InventoryReservationStatus): 'warning' | 'info' | 'success' {
  if (status === 'ACTIVE') {
    return 'warning';
  }
  if (status === 'RELEASED') {
    return 'info';
  }
  return 'success';
}

export function AdminInventoryTraceabilityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showAlert } = useAdminUi();

  const [reservationsData, setReservationsData] = useState<InventoryReservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParam, setSearchParam] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReservationStatusFilter>('ALL');
  const [inventoryIdFilter, setInventoryIdFilter] = useState<number | null>(null);

  const filteredReservations = useMemo(() => {
    const query = searchParam.trim().toLowerCase();
    return reservationsData
      .filter((reservation) => {
        if (inventoryIdFilter && reservation.inventoryId !== inventoryIdFilter) {
          return false;
        }

        if (statusFilter !== 'ALL' && reservation.status !== statusFilter) {
          return false;
        }

        if (!query) {
          return true;
        }

        const variant = reservation.inventory.variant;
        const store = reservation.inventory.store;
        const order = reservation.order;
        const reservedBy = reservation.reservedBy
          ? `${reservation.reservedBy.firstName} ${reservation.reservedBy.lastName || ''}`.trim()
          : '';

        const rowText = [
          variant.sku,
          variant.product.name,
          variant.color.name,
          variant.size.name,
          store.name,
          store.code,
          order?.code || '',
          order?.status || '',
          reservedBy,
        ]
          .join(' ')
          .toLowerCase();

        return rowText.includes(query);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [inventoryIdFilter, reservationsData, searchParam, statusFilter]);

  const loadReservations = useCallback(async (inventoryId: number | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (inventoryId) {
        params.set('inventoryId', String(inventoryId));
      }
      const query = params.toString();
      const response = await fetch(
        query ? `/api/admin/inventory/reservations?${query}` : '/api/admin/inventory/reservations',
        {
          method: 'GET',
          cache: 'no-store',
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { message?: unknown } | null)?.message || 'Error al cargar trazabilidad.'), 'error');
        setReservationsData([]);
        return;
      }

      setReservationsData(normalizeReservations(payload));
    } catch {
      showAlert('Error al cargar trazabilidad de reservas.', 'error');
      setReservationsData([]);
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    setInventoryIdFilter(parseInventoryId(searchParams.get('inventoryId')));
  }, [searchParams]);

  useEffect(() => {
    loadReservations(inventoryIdFilter);
  }, [inventoryIdFilter, loadReservations]);

  function onStatusFilterChange(value: string) {
    const normalized = value as ReservationStatusFilter;
    setStatusFilter(ALLOWED_STATUS.includes(normalized) ? normalized : 'ALL');
  }

  function clearInventoryFilter() {
    setInventoryIdFilter(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('inventoryId');
    const query = params.toString();
    router.replace(query ? `/admin/inventory/traceability?${query}` : '/admin/inventory/traceability');
  }

  function openOrderDetail(orderId?: number | null) {
    const parsed = Number(orderId || 0);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      showAlert('La reserva no tiene una orden asociada.', 'warning');
      return;
    }
    router.push(`/admin/orders/${parsed}`);
  }

  function openMovementsForReservation(reservation: InventoryReservation) {
    const inventoryId = Number(reservation.inventoryId || 0);
    if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
      router.push('/admin/inventory/movements');
      return;
    }
    router.push(`/admin/inventory/movements?inventoryId=${inventoryId}`);
  }

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card inventory-header-card">
        <div>
          <p className="section-kicker">Inventario</p>
          <h1 className="section-title">Trazabilidad de reservas</h1>
          <p className="section-subtitle">Seguimiento de stock reservado, liberado o completado por pedido.</p>
        </div>
        <div className="inventory-header-actions">
          <Link href="/admin/inventory" className="admin-ghost-btn">Volver a inventario</Link>
          <Link href="/admin/inventory/movements" className="admin-ghost-btn">Ir a movimientos</Link>
          <button type="button" className="admin-ghost-btn" onClick={() => loadReservations(inventoryIdFilter)}>
            Actualizar
          </button>
        </div>
      </article>

      <nav className="admin-card inventory-mobile-actions-next" aria-label="Acciones de trazabilidad">
        <Link href="/admin/inventory" className="admin-ghost-btn">Volver a inventario</Link>
        <Link href="/admin/inventory/movements" className="admin-ghost-btn">Ir a movimientos</Link>
        <button type="button" className="admin-ghost-btn" onClick={() => loadReservations(inventoryIdFilter)}>
          Actualizar
        </button>
      </nav>

      <article className="admin-card admin-filters-card-next inventory-filters-card">
        <fieldset className="admin-filters-fieldset-next">
          <legend className="admin-filters-legend-next">Filtros</legend>
          <div className="inventory-traceability-filter-grid">
            <label className="inventory-field">
              <span>Buscar reserva</span>
              <input
                type="text"
                value={searchParam}
                onChange={(event) => setSearchParam(event.target.value)}
                placeholder="Pedido, SKU, producto, tienda o usuario"
              />
            </label>

            <div className="inventory-field">
              <span>Estado</span>
              <AdminSelect
                value={statusFilter}
                options={RESERVATION_STATUS_OPTIONS}
                ariaLabel="Filtrar reservas por estado"
                onChange={onStatusFilterChange}
              />
            </div>

            <div className="inventory-filter-inline-action">
              {inventoryIdFilter ? (
                <button type="button" className="admin-ghost-btn" onClick={clearInventoryFilter}>
                  Quitar filtro de inventario
                </button>
              ) : null}
            </div>
          </div>

          <p className="admin-muted-text">
            Mostrando <strong>{filteredReservations.length}</strong> de <strong>{reservationsData.length}</strong> reservas.
            {inventoryIdFilter ? ` Filtro activo por inventario #${inventoryIdFilter}.` : ''}
          </p>
        </fieldset>
      </article>

      <article className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table ops-cards-next">
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Estado reserva</th>
                <th>Variante</th>
                <th>Tienda</th>
                <th>Cantidad</th>
                <th>Pedido</th>
                <th>Estado pedido</th>
                <th>Reservado por</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} data-label="Estado">Cargando trazabilidad...</td>
                </tr>
              ) : filteredReservations.length === 0 ? (
                <tr>
                  <td colSpan={10} data-label="Estado">No hay reservas para los filtros actuales.</td>
                </tr>
              ) : (
                filteredReservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td data-label="#">{reservation.id}</td>
                    <td data-label="Fecha">{formatDate(reservation.createdAt)}</td>
                    <td data-label="Estado reserva" className="ops-status-next">
                      <span className={`admin-status-badge ${getReservationStatusTone(reservation.status)}`}>
                        {getReservationStatusLabel(reservation.status)}
                      </span>
                    </td>
                    <td data-label="Variante" className="list-card-title-next">
                      {reservation.inventory.variant.product.name}
                      {' - '}
                      {reservation.inventory.variant.color.name}
                      {' / '}
                      {reservation.inventory.variant.size.name}
                      {' - '}
                      {reservation.inventory.variant.sku}
                    </td>
                    <td data-label="Tienda">
                      {reservation.inventory.store.name}
                      {' ('}
                      {reservation.inventory.store.code}
                      {')'}
                    </td>
                    <td data-label="Cantidad">{reservation.quantity}</td>
                    <td data-label="Pedido">{reservation.order?.code || '-'}</td>
                    <td data-label="Estado pedido" className="ops-hide-mobile">{reservation.order?.status || '-'}</td>
                    <td data-label="Reservado por" className="ops-hide-mobile">
                      {reservation.reservedBy
                        ? `${reservation.reservedBy.firstName} ${reservation.reservedBy.lastName || ''}`.trim()
                        : '-'}
                    </td>
                    <td data-label="Accion">
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-ghost-btn"
                          onClick={() => openMovementsForReservation(reservation)}
                        >
                          Ver movimientos
                        </button>
                        <button
                          type="button"
                          className="admin-ghost-btn"
                          onClick={() => openOrderDetail(reservation.order?.id)}
                        >
                          Ver pedido
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
