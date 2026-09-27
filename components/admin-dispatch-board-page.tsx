'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminUi } from '@/components/admin-ui-provider';

type DispatchTask = {
  id: string;
  code: string;
  type: 'PACKING' | 'DELIVERY_DISPATCH' | 'CUSTOMER_HANDOFF';
  status: string;
  priority: string;
  title: string;
  dueAt?: string | null;
  assignedUser?: { firstName?: string; lastName?: string } | null;
  store: { name: string };
  order?: { id: number; code: string; status: string; clientName?: string | null } | null;
};

const ACTIVE = new Set(['PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_CONFIRMATION', 'OVERDUE']);

function person(task: DispatchTask): string {
  const name = `${task.assignedUser?.firstName || ''} ${task.assignedUser?.lastName || ''}`.trim();
  return name || 'Sin responsable';
}

export function AdminDispatchBoardPage() {
  const { showAlert } = useAdminUi();
  const [tasks, setTasks] = useState<DispatchTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ACTIVE' | 'PACKING' | 'DELIVERY_DISPATCH' | 'OVERDUE' | 'ALL'>('ACTIVE');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/tasks?pageSize=100', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.message || 'No se pudo cargar empaque y despacho.'));
      const rows = Array.isArray(payload?.items) ? payload.items : [];
      setTasks(rows.filter((task: DispatchTask) => ['PACKING', 'DELIVERY_DISPATCH', 'CUSTOMER_HANDOFF'].includes(task.type)));
    } catch (caught) {
      setTasks([]);
      showAlert(caught instanceof Error ? caught.message : 'No se pudo cargar empaque y despacho.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => tasks.filter((task) => {
    if (filter === 'ALL') return true;
    if (filter === 'ACTIVE') return ACTIVE.has(task.status);
    if (filter === 'OVERDUE') return task.status === 'OVERDUE';
    return task.type === filter && ACTIVE.has(task.status);
  }), [filter, tasks]);
  const counts = useMemo(() => ({
    packing: tasks.filter((task) => task.type === 'PACKING' && ACTIVE.has(task.status)).length,
    dispatch: tasks.filter((task) => task.type !== 'PACKING' && ACTIVE.has(task.status)).length,
    overdue: tasks.filter((task) => task.status === 'OVERDUE').length,
    unassigned: tasks.filter((task) => ACTIVE.has(task.status) && !task.assignedUser).length,
  }), [tasks]);

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card orders-header-card-next">
        <div className="orders-header-next"><h1>Supervisión de empaque y despacho</h1><p>Controla pedidos listos, atrasados y sin responsable desde una sola bandeja.</p></div>
        <button type="button" className="admin-ghost-btn" onClick={() => void load()} disabled={loading}>{loading ? 'Actualizando...' : 'Actualizar'}</button>
      </article>
      <div className="dashboard-kpi-grid-next">
        <article className="dashboard-kpi-card-next"><p>Por empacar</p><strong>{counts.packing}</strong><span>Tareas activas</span></article>
        <article className="dashboard-kpi-card-next"><p>Por despachar</p><strong>{counts.dispatch}</strong><span>Despacho o entrega</span></article>
        <article className="dashboard-kpi-card-next"><p>Atrasadas</p><strong>{counts.overdue}</strong><span>Requieren atención</span></article>
        <article className="dashboard-kpi-card-next"><p>Sin responsable</p><strong>{counts.unassigned}</strong><span>Pendientes de asignar</span></article>
      </div>
      <article className="admin-card">
        <div className="admin-table-actions" role="group" aria-label="Filtros de empaque y despacho">
          {([
            ['ACTIVE', 'Activas'], ['PACKING', 'Por empacar'], ['DELIVERY_DISPATCH', 'Por despachar'],
            ['OVERDUE', 'Atrasadas'], ['ALL', 'Todas'],
          ] as const).map(([value, label]) => <button key={value} type="button" className={filter === value ? 'admin-primary-btn' : 'admin-ghost-btn'} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        <div className="admin-table-wrap"><table className="admin-table mobile-card-table"><thead><tr><th>Pedido</th><th>Etapa</th><th>Sede</th><th>Responsable</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={6}>Cargando...</td></tr> : visible.length === 0 ? <tr><td colSpan={6}>No hay operaciones en esta vista.</td></tr> : visible.map((task) => <tr key={task.id}>
            <td data-label="Pedido"><strong>{task.order?.code || task.code}</strong><br /><small>{task.order?.clientName || ''}</small></td>
            <td data-label="Etapa">{task.type === 'PACKING' ? 'Empaque' : task.type === 'CUSTOMER_HANDOFF' ? 'Entrega al cliente' : 'Despacho'}</td>
            <td data-label="Sede">{task.store.name}</td><td data-label="Responsable">{person(task)}</td>
            <td data-label="Estado"><span className={`admin-pill ${task.status === 'OVERDUE' ? 'error' : 'warning'}`}>{task.status.replaceAll('_', ' ')}</span></td>
            <td data-label="Acción"><div className="admin-table-actions"><Link className="admin-ghost-btn" href={`/admin/tasks/${task.id}`}>Abrir tarea</Link>{task.order ? <Link className="admin-ghost-btn" href={`/admin/orders/${task.order.id}`}>Ver pedido</Link> : null}</div></td>
          </tr>)}</tbody>
        </table></div>
      </article>
    </section>
  );
}
