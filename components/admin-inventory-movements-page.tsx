'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AdminSelect, AdminSelectOption } from '@/components/admin-select';
import { useAdminUi } from '@/components/admin-ui-provider';
import { InventoryMovement, InventoryMovementType, normalizeInventoryMovements } from '@/lib/admin-inventory-types';

type MovementTypeFilter = 'ALL' | InventoryMovementType;

const ALLOWED_TYPES: MovementTypeFilter[] = ['ALL', 'IN', 'OUT', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'RESERVED', 'UNRESERVED'];

const MOVEMENTS_PAGE_SIZE = 20;

const MOVEMENT_TYPE_OPTIONS: AdminSelectOption<MovementTypeFilter>[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'IN', label: 'Ingreso' },
  { value: 'OUT', label: 'Salida' },
  { value: 'ADJUSTMENT', label: 'Ajuste' },
  { value: 'TRANSFER_OUT', label: 'Transferencia salida' },
  { value: 'TRANSFER_IN', label: 'Transferencia ingreso' },
  { value: 'RESERVED', label: 'Comprometido' },
  { value: 'UNRESERVED', label: 'Liberado' },
];

function normalizeVariantAttribute(value?: string | null): string {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.startsWith('__SIN_')) {
    return '';
  }
  return normalized;
}

/**
 * Titulo de la tarjeta de movimiento. Para producto unico (sin color/talla
 * reales) muestra solo el nombre del producto; si tiene variante, agrega
 * color / talla y el SKU.
 */
function buildMovementTitle(variant: InventoryMovement['inventory']['variant']): string {
  const color = normalizeVariantAttribute(variant.color?.name);
  const size = normalizeVariantAttribute(variant.size?.name);
  const attrs = [color, size].filter(Boolean).join(' / ');
  if (!attrs) {
    return variant.product.name;
  }
  return `${variant.product.name} - ${attrs} - ${variant.sku}`;
}

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

function getMovementTypeLabel(type: InventoryMovementType): string {
  const labels: Record<InventoryMovementType, string> = {
    IN: 'Ingreso',
    OUT: 'Salida',
    ADJUSTMENT: 'Ajuste',
    TRANSFER_OUT: 'Transferencia salida',
    TRANSFER_IN: 'Transferencia ingreso',
    RESERVED: 'Comprometido',
    UNRESERVED: 'Liberado',
  };
  return labels[type] || type;
}

function getMovementTypeTone(type: InventoryMovementType): 'info' | 'success' | 'warning' {
  if (type === 'IN' || type === 'TRANSFER_IN' || type === 'UNRESERVED') {
    return 'success';
  }
  if (type === 'OUT' || type === 'TRANSFER_OUT' || type === 'RESERVED') {
    return 'warning';
  }
  return 'info';
}

export function AdminInventoryMovementsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showAlert } = useAdminUi();

  const [movementsData, setMovementsData] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParam, setSearchParam] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<MovementTypeFilter>('ALL');
  const [inventoryIdFilter, setInventoryIdFilter] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredMovements = useMemo(() => {
    const query = searchParam.trim().toLowerCase();
    return movementsData
      .filter((movement) => {
        if (inventoryIdFilter && movement.inventory.id !== inventoryIdFilter) {
          return false;
        }
        if (movementTypeFilter !== 'ALL' && movement.type !== movementTypeFilter) {
          return false;
        }
        if (!query) {
          return true;
        }

        const variant = movement.inventory.variant;
        const store = movement.inventory.store;
        const rowText = [
          variant.sku,
          variant.product.name,
          variant.color.name,
          variant.size.name,
          store.name,
          store.code,
          movement.type,
          movement.note || '',
        ]
          .join(' ')
          .toLowerCase();
        return rowText.includes(query);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [movementsData, inventoryIdFilter, movementTypeFilter, searchParam]);

  const totalPages = Math.max(1, Math.ceil(filteredMovements.length / MOVEMENTS_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const pagedMovements = useMemo(() => {
    const start = (safePage - 1) * MOVEMENTS_PAGE_SIZE;
    return filteredMovements.slice(start, start + MOVEMENTS_PAGE_SIZE);
  }, [filteredMovements, safePage]);

  // Volver a la primera pagina cuando cambian los filtros o la busqueda
  useEffect(() => {
    setCurrentPage(1);
  }, [inventoryIdFilter, movementTypeFilter, searchParam]);

  // Corregir la pagina si el total se reduce (p. ej. tras filtrar)
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  async function loadMovements() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/inventory/movements', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { message?: unknown } | null)?.message || 'Error al cargar movimientos.'), 'error');
        setMovementsData([]);
        return;
      }
      setMovementsData(normalizeInventoryMovements(payload));
    } catch {
      showAlert('Error al cargar movimientos de inventario.', 'error');
      setMovementsData([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setInventoryIdFilter(parseInventoryId(searchParams.get('inventoryId')));
  }, [searchParams]);

  useEffect(() => {
    loadMovements();
  }, []);

  function clearInventoryFilter() {
    setInventoryIdFilter(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('inventoryId');
    const query = params.toString();
    router.replace(query ? `/admin/inventory/movements?${query}` : '/admin/inventory/movements');
  }

  function openTraceabilityForMovement(movement: InventoryMovement) {
    const inventoryId = Number(movement.inventory.id || 0);
    if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
      router.push('/admin/inventory/traceability');
      return;
    }
    router.push(`/admin/inventory/traceability?inventoryId=${inventoryId}`);
  }

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card inventory-header-card">
        <div>
          <p className="section-kicker">Inventario</p>
          <h1 className="section-title">Movimientos</h1>
          <p className="section-subtitle">Historial completo de ingresos, salidas y ajustes.</p>
        </div>
        <div className="inventory-header-actions">
          <Link href="/admin/inventory" className="admin-ghost-btn">Volver a inventario</Link>
          <Link href="/admin/inventory/traceability" className="admin-ghost-btn">Ir a trazabilidad</Link>
          <button type="button" className="admin-ghost-btn" onClick={loadMovements}>Actualizar</button>
        </div>
      </article>

      <nav className="admin-card inventory-mobile-actions-next" aria-label="Acciones de movimientos">
        <Link href="/admin/inventory" className="admin-ghost-btn">Volver a inventario</Link>
        <Link href="/admin/inventory/traceability" className="admin-ghost-btn">Ir a trazabilidad</Link>
        <button type="button" className="admin-ghost-btn" onClick={loadMovements}>Actualizar</button>
      </nav>

      <article className="admin-card admin-filters-card-next inventory-filters-card">
        <fieldset className="admin-filters-fieldset-next">
          <legend className="admin-filters-legend-next">Filtros</legend>
          <div className="inventory-movements-filter-grid">
            <label className="inventory-field">
              <span>Buscar movimiento</span>
              <input
                type="text"
                value={searchParam}
                onChange={(event) => setSearchParam(event.target.value)}
                placeholder="SKU, producto, tienda o nota"
              />
            </label>

            <div className="inventory-field">
              <span>Tipo</span>
              <AdminSelect
                value={movementTypeFilter}
                options={MOVEMENT_TYPE_OPTIONS}
                ariaLabel="Filtrar movimientos por tipo"
                onChange={(nextValue) => setMovementTypeFilter(ALLOWED_TYPES.includes(nextValue) ? nextValue : 'ALL')}
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
            Mostrando <strong>{filteredMovements.length}</strong> de <strong>{movementsData.length}</strong> movimientos.
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
                <th>Tipo</th>
                <th>Variante</th>
                <th>Tienda</th>
                <th>Cantidad</th>
                <th>Nota</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} data-label="Estado">Cargando movimientos...</td>
                </tr>
              ) : filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={8} data-label="Estado">No hay movimientos para los filtros seleccionados.</td>
                </tr>
              ) : (
                pagedMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td data-label="#">{movement.id}</td>
                    <td data-label="Fecha">{formatDate(movement.createdAt)}</td>
                    <td data-label="Tipo" className="ops-status-next">
                      <span className={`admin-status-badge ${getMovementTypeTone(movement.type)}`}>
                        {getMovementTypeLabel(movement.type)}
                      </span>
                    </td>
                    <td data-label="Variante" className="list-card-title-next">
                      {buildMovementTitle(movement.inventory.variant)}
                    </td>
                    <td data-label="Tienda">{movement.inventory.store.name} ({movement.inventory.store.code})</td>
                    <td data-label="Cantidad">{movement.quantity}</td>
                    <td data-label="Nota" className="ops-hide-mobile">{movement.note || '-'}</td>
                    <td data-label="Accion">
                      <div className="admin-table-actions">
                        <button type="button" className="admin-ghost-btn" onClick={() => openTraceabilityForMovement(movement)}>
                          Ver trazabilidad
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredMovements.length > 0 ? (
          <div className="admin-pagination">
            <button
              type="button"
              className="admin-ghost-btn"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
            >
              Anterior
            </button>
            <p>Pagina {safePage} de {totalPages} ({filteredMovements.length} movimientos)</p>
            <button
              type="button"
              className="admin-ghost-btn"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))}
            >
              Siguiente
            </button>
          </div>
        ) : null}
      </article>
    </section>
  );
}
