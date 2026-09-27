'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { useAdminUi } from '@/components/admin-ui-provider';
import styles from './admin-operational-tasks-page.module.css';

type TaskStatus = 'PENDING_ACCEPTANCE' | 'ACCEPTED' | 'IN_PROGRESS' | 'WAITING_CONFIRMATION' | 'COMPLETED' | 'REJECTED' | 'CANCELLED' | 'OVERDUE';
type TaskType = 'ORDER_REVIEW' | 'LOCAL_PICKING' | 'REMOTE_PICKING' | 'PACKING' | 'TRANSFER_DISPATCH' | 'TRANSFER_RECEIVE' | 'DELIVERY_DISPATCH' | 'CUSTOMER_HANDOFF' | 'DISCREPANCY_REVIEW';

interface TaskUser { id: number; firstName: string; lastName: string; email?: string | null }
interface TaskItemVariant { id: number; sku: string; variantKey?: string | null; product: { id: number; name: string }; color?: { name: string } | null; size?: { name: string } | null }
interface TaskLine { id: number; quantity: number; picked?: number; reserved?: number; shortageQuantity?: number; fulfillmentStoreId?: number | null; variant: TaskItemVariant }
interface OperationalTask {
  id: string; code: string; type: TaskType; status: TaskStatus; priority: 'NORMAL' | 'HIGH' | 'URGENT';
  title: string; description?: string | null; version: number; dueAt?: string | null; createdAt: string;
  acceptedAt?: string | null; startedAt?: string | null; completedAt?: string | null; rejectedAt?: string | null;
  rejectionReason?: string | null; isCrossStoreAssignment: boolean; assignmentOverrideReason?: string | null;
  store: { id: number; name: string; code: string; type: string };
  assignedUser?: TaskUser | null; assignedUserId?: number | null;
  order?: { id: number; code: string; status: string; salesChannel: string; sourceStoreId: number; clientName?: string | null; items: TaskLine[] } | null;
  transfer?: { id: number; code: string; status: string; note?: string | null; fromStore: { id: number; name: string }; toStore: { id: number; name: string }; items: TaskLine[] } | null;
  events?: Array<{ id: string; eventType: string; note?: string | null; metadata?: Record<string, unknown> | null; createdAt: string; actorUser?: TaskUser | null }>;
}

interface UserOption extends TaskUser { isActive?: boolean; role?: { name?: string } }

const ACTIVE_STATUSES: TaskStatus[] = ['PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_CONFIRMATION', 'OVERDUE'];
const statusLabels: Record<TaskStatus, string> = {
  PENDING_ACCEPTANCE: 'Por aceptar', ACCEPTED: 'Aceptada', IN_PROGRESS: 'En proceso', WAITING_CONFIRMATION: 'Por confirmar',
  COMPLETED: 'Completada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada', OVERDUE: 'Vencida',
};
const typeLabels: Record<TaskType, string> = {
  ORDER_REVIEW: 'Revisión de pedido', LOCAL_PICKING: 'Picking local', REMOTE_PICKING: 'Separación remota', PACKING: 'Empaque',
  TRANSFER_DISPATCH: 'Despacho de transferencia', TRANSFER_RECEIVE: 'Recepción de transferencia', DELIVERY_DISPATCH: 'Despacho',
  CUSTOMER_HANDOFF: 'Entrega al cliente', DISCREPANCY_REVIEW: 'Revisión de diferencia',
};

function displayName(user?: TaskUser | null) {
  return user ? `${user.firstName} ${user.lastName}`.trim() : 'Sin asignar';
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin límite';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function normalizeTask(payload: unknown): OperationalTask | null {
  if (!payload || typeof payload !== 'object' || !(payload as OperationalTask).id) return null;
  return payload as OperationalTask;
}

export function AdminOperationalTasksPage({ taskId }: { taskId?: string }) {
  const { user, hasPermission } = useAdminAuth();
  const { showAlert } = useAdminUi();
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [detail, setDetail] = useState<OperationalTask | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [filter, setFilter] = useState<'ACTIVE' | 'ALL' | TaskStatus>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [override, setOverride] = useState<{ userId: number; message: string } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'PICKUP' | 'OWN_DELIVERY' | 'COURIER'>('PICKUP');
  const [recipientName, setRecipientName] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const [rescheduledAt, setRescheduledAt] = useState('');

  const canAssign = hasPermission('tasks.assign');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const response = await fetch(taskId ? `/api/admin/tasks/${encodeURIComponent(taskId)}` : '/api/admin/tasks?pageSize=100', { cache: 'no-store' }).catch(() => null);
    if (!response) { setError('No se pudo conectar con el servidor.'); setLoading(false); return; }
    const payload = await response.json().catch(() => null);
    if (!response.ok) { setError(String(payload?.message || 'No se pudieron cargar las tareas.')); setLoading(false); return; }
    if (taskId) {
      const task = normalizeTask(payload); setDetail(task); setSelectedUserId(task?.assignedUserId ? String(task.assignedUserId) : '');
    } else {
      setTasks(Array.isArray(payload?.items) ? payload.items : []);
    }
    setLoading(false);
  }, [taskId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!taskId || !canAssign) return;
    void fetch('/api/admin/users', { cache: 'no-store' }).then((response) => response.json()).then((payload) => {
      setUsers(Array.isArray(payload) ? payload.filter((item) => item?.isActive !== false) : []);
    }).catch(() => undefined);
  }, [canAssign, taskId]);

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    if (filter === 'ALL') return true;
    if (filter === 'ACTIVE') return ACTIVE_STATUSES.includes(task.status);
    return task.status === filter;
  }), [filter, tasks]);

  const counts = useMemo(() => ({
    active: tasks.filter((task) => ACTIVE_STATUSES.includes(task.status)).length,
    urgent: tasks.filter((task) => ACTIVE_STATUSES.includes(task.status) && task.priority === 'URGENT').length,
    completed: tasks.filter((task) => task.status === 'COMPLETED').length,
  }), [tasks]);

  async function taskAction(id: string, action: 'accept' | 'reject' | 'start' | 'complete', version: number) {
    let reason: string | undefined;
    if (action === 'reject') {
      reason = window.prompt('Indica el motivo del rechazo:')?.trim();
      if (!reason) return;
    }
    setBusy(true);
    const delivery = action === 'complete' && detail?.type === 'DELIVERY_DISPATCH' ? {
      mode: deliveryMode,
      recipientName,
      carrierName,
      trackingCode,
      evidenceUrl,
    } : undefined;
    const response = await fetch(`/api/admin/tasks/${encodeURIComponent(id)}/${action}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: version, reason, delivery }),
    }).catch(() => null);
    const payload = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) { showAlert(String(payload?.message || 'No se pudo actualizar la tarea.'), 'error'); return; }
    showAlert('Tarea actualizada.', 'success'); await load();
  }

  async function reportDeliveryFailure() {
    if (!detail || failureReason.trim().length < 5) {
      showAlert('Indica el motivo de la entrega fallida.', 'warning');
      return;
    }
    setBusy(true);
    const response = await fetch(`/api/admin/tasks/${encodeURIComponent(detail.id)}/delivery-failure`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: detail.version,
        reason: failureReason.trim(),
        rescheduledAt: rescheduledAt ? new Date(rescheduledAt).toISOString() : undefined,
      }),
    }).catch(() => null);
    const payload = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) { showAlert(String(payload?.message || 'No se pudo registrar el intento.'), 'error'); return; }
    setFailureReason(''); setRescheduledAt('');
    showAlert('Intento fallido registrado; el despacho sigue pendiente.', 'success');
    await load();
  }

  async function assign(force = false) {
    if (!detail || !selectedUserId) return;
    setBusy(true);
    const response = await fetch(`/api/admin/tasks/${encodeURIComponent(detail.id)}/assign`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignedUserId: Number(selectedUserId), expectedVersion: detail.version, force, reason: force ? overrideReason : undefined }),
    }).catch(() => null);
    const payload = await response?.json().catch(() => null);
    setBusy(false);
    if (response?.status === 409 && payload?.requiresConfirmation) {
      setOverride({ userId: Number(selectedUserId), message: String(payload.message) }); return;
    }
    if (!response?.ok) { showAlert(String(payload?.message || 'No se pudo asignar la tarea.'), 'error'); return; }
    setOverride(null); setOverrideReason(''); showAlert('Responsable asignado.', 'success'); await load();
  }

  async function pickLine(line: TaskLine, pickedQuantity: number) {
    if (!detail) return;
    setBusy(true);
    const response = await fetch(`/api/admin/tasks/${encodeURIComponent(detail.id)}/items/${line.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pickedQuantity }),
    }).catch(() => null);
    const payload = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) { showAlert(String(payload?.message || 'No se pudo registrar la cantidad.'), 'error'); return; }
    setDetail(normalizeTask(payload));
  }

  if (loading) return <article className={styles.loading}><span className={styles.spinner} /> Cargando trabajo operativo...</article>;
  if (error) return <article className={styles.error}><h1>No pudimos abrir las tareas</h1><p>{error}</p><button onClick={() => void load()}>Reintentar</button></article>;

  if (taskId && detail) {
    const rawLines = detail.transfer?.items || detail.order?.items || [];
    const isPicking = detail.type === 'LOCAL_PICKING' || detail.type === 'REMOTE_PICKING';
    const lines = detail.order && isPicking
      ? rawLines.filter((line) => (line.fulfillmentStoreId ?? detail.order!.sourceStoreId) === detail.store.id)
      : rawLines;
    return (
      <main className={styles.page}>
        <div className={styles.backRow}><Link href="/admin/tasks">← Volver a Mis tareas</Link><span>{detail.code}</span></div>
        <section className={styles.detailHero}>
          <div><div className={styles.eyebrow}>{typeLabels[detail.type]} · {detail.store.name}</div><h1>{detail.title}</h1><p>{detail.description}</p></div>
          <span className={`${styles.status} ${styles[detail.status]}`}>{statusLabels[detail.status]}</span>
        </section>

        <div className={styles.detailGrid}>
          <section className={styles.panel}>
            <div className={styles.panelTitle}><div><span className={styles.eyebrow}>Ejecución rápida</span><h2>Productos a tratar</h2></div><strong>{lines.length} líneas</strong></div>
            {detail.transfer ? <div className={styles.route}><span>{detail.transfer.fromStore.name}</span><b>→</b><span>{detail.transfer.toStore.name}</span></div> : null}
            <div className={styles.lines}>
              {lines.map((line) => <div className={styles.line} key={line.id}>
                <div className={styles.qty}>{line.quantity}</div>
                <div><strong>{line.variant.product.name}</strong><span>{[line.variant.sku, line.variant.color?.name, line.variant.size?.name].filter(Boolean).join(' · ')}</span></div>
                {typeof line.picked === 'number' ? <div className={styles.pickControls}><small>{line.picked}/{Math.max(0, line.quantity - (line.shortageQuantity || 0))} separados</small>{isPicking && detail.status === 'IN_PROGRESS' && detail.assignedUserId === user?.id ? <span><button disabled={busy || line.picked <= 0} onClick={() => void pickLine(line, Math.max(0, (line.picked || 0) - 1))}>−</button><button disabled={busy || line.picked >= Math.max(0, line.quantity - (line.shortageQuantity || 0))} onClick={() => void pickLine(line, Math.max(0, line.quantity - (line.shortageQuantity || 0)))}>Todo</button><button disabled={busy || line.picked >= Math.max(0, line.quantity - (line.shortageQuantity || 0))} onClick={() => void pickLine(line, Math.min(Math.max(0, line.quantity - (line.shortageQuantity || 0)), (line.picked || 0) + 1))}>+</button></span> : null}</div> : null}
              </div>)}
              {lines.length === 0 ? <p className={styles.muted}>Esta tarea no contiene líneas de producto.</p> : null}
            </div>
            {detail.type === 'DELIVERY_DISPATCH' && ['IN_PROGRESS', 'WAITING_CONFIRMATION'].includes(detail.status) && detail.assignedUserId === user?.id ? (
              <div className={styles.assignBox}>
                <label htmlFor="delivery-mode">Modalidad de entrega</label>
                <select id="delivery-mode" value={deliveryMode} onChange={(event) => setDeliveryMode(event.target.value as typeof deliveryMode)}>
                  <option value="PICKUP">Recojo en tienda</option><option value="OWN_DELIVERY">Reparto propio</option><option value="COURIER">Courier</option>
                </select>
                <label htmlFor="delivery-recipient">Persona que recibe</label><input id="delivery-recipient" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} />
                {deliveryMode === 'COURIER' ? <><label htmlFor="delivery-carrier">Transportista</label><input id="delivery-carrier" value={carrierName} onChange={(event) => setCarrierName(event.target.value)} /><label htmlFor="delivery-tracking">Código de seguimiento</label><input id="delivery-tracking" value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} /></> : null}
                <label htmlFor="delivery-evidence">URL de evidencia (opcional)</label><input id="delivery-evidence" type="url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} />
                <hr />
                <label htmlFor="delivery-failure">Motivo si no se pudo entregar</label><textarea id="delivery-failure" value={failureReason} onChange={(event) => setFailureReason(event.target.value)} />
                <label htmlFor="delivery-reschedule">Reprogramar para</label><input id="delivery-reschedule" type="datetime-local" value={rescheduledAt} onChange={(event) => setRescheduledAt(event.target.value)} />
                <button type="button" disabled={busy || failureReason.trim().length < 5} onClick={() => void reportDeliveryFailure()}>Registrar intento fallido</button>
              </div>
            ) : null}
            <div className={styles.actionRow}>
              {detail.status === 'PENDING_ACCEPTANCE' && detail.assignedUserId === user?.id ? <><button className={styles.primary} disabled={busy} onClick={() => void taskAction(detail.id, 'start', detail.version)}>Aceptar e iniciar</button><button className={styles.danger} disabled={busy} onClick={() => void taskAction(detail.id, 'reject', detail.version)}>Rechazar</button></> : null}
              {detail.status === 'ACCEPTED' && detail.assignedUserId === user?.id ? <button className={styles.primary} disabled={busy} onClick={() => void taskAction(detail.id, 'start', detail.version)}>Iniciar tarea</button> : null}
              {['IN_PROGRESS', 'WAITING_CONFIRMATION'].includes(detail.status) && detail.assignedUserId === user?.id ? <button className={styles.primary} disabled={busy || (detail.type === 'DELIVERY_DISPATCH' && (recipientName.trim().length < 2 || (deliveryMode === 'COURIER' && (!carrierName.trim() || !trackingCode.trim()))))} onClick={() => void taskAction(detail.id, 'complete', detail.version)}>{detail.type === 'ORDER_REVIEW' ? 'Confirmar pedido y preparar' : detail.type === 'DELIVERY_DISPATCH' ? 'Confirmar entrega' : 'Marcar como completada'}</button> : null}
            </div>
          </section>

          <aside className={styles.sideStack}>
            <section className={styles.panel}>
              <span className={styles.eyebrow}>Responsabilidad</span><h2>{displayName(detail.assignedUser)}</h2>
              <dl className={styles.meta}><div><dt>Sede</dt><dd>{detail.store.name}</dd></div><div><dt>Creada</dt><dd>{formatDate(detail.createdAt)}</dd></div><div><dt>Vence</dt><dd>{formatDate(detail.dueAt)}</dd></div></dl>
              {detail.isCrossStoreAssignment ? <div className={styles.warning}>Asignación excepcional fuera de sede.<br /><small>{detail.assignmentOverrideReason}</small></div> : null}
              {canAssign ? <div className={styles.assignBox}><label htmlFor="task-user">Asignar o reasignar</label><select id="task-user" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}><option value="">Selecciona un usuario</option>{users.map((item) => <option key={item.id} value={item.id}>{displayName(item)} · {item.role?.name || 'Usuario'}</option>)}</select><button disabled={busy || !selectedUserId} onClick={() => void assign(false)}>Guardar responsable</button></div> : null}
            </section>
            <section className={styles.panel}><span className={styles.eyebrow}>Trazabilidad</span><h2>Historial</h2><div className={styles.timeline}>{detail.events?.map((event) => <div key={event.id}><i /><p><strong>{event.eventType.replaceAll('_', ' ')}</strong><span>{displayName(event.actorUser)} · {formatDate(event.createdAt)}</span>{event.note ? <small>{event.note}</small> : null}{event.metadata?.recipientName ? <small>Recibió: {String(event.metadata.recipientName)}</small> : null}{event.metadata?.trackingCode ? <small>Seguimiento: {String(event.metadata.trackingCode)}</small> : null}</p></div>)}</div></section>
          </aside>
        </div>

        {override ? <div className={styles.modalBackdrop}><section className={styles.modal} role="dialog" aria-modal="true"><span className={styles.modalIcon}>!</span><h2>Usuario fuera de esta sede</h2><p>{override.message}</p><label htmlFor="override-reason">Motivo de la excepción</label><textarea id="override-reason" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Ej. Está apoyando temporalmente en esta sede" /><div className={styles.actionRow}><button onClick={() => { setOverride(null); setOverrideReason(''); }}>Cancelar</button><button className={styles.primary} disabled={busy || overrideReason.trim().length < 5} onClick={() => void assign(true)}>Confirmar excepción</button></div></section></div> : null}
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}><div><span className={styles.eyebrow}>Centro de trabajo</span><h1>Mis tareas</h1><p>Todo lo que necesitas preparar, mover o confirmar, sin recorrer otros módulos.</p></div><button onClick={() => void load()}>Actualizar</button></header>
      <section className={styles.stats}><article><span>Trabajo activo</span><strong>{counts.active}</strong><small>Asignadas y pendientes</small></article><article><span>Prioridad urgente</span><strong>{counts.urgent}</strong><small>Requieren atención ahora</small></article><article><span>Completadas</span><strong>{counts.completed}</strong><small>En la vista actual</small></article></section>
      <nav className={styles.filters}>{(['ACTIVE', 'PENDING_ACCEPTANCE', 'IN_PROGRESS', 'COMPLETED', 'ALL'] as const).map((value) => <button key={value} className={filter === value ? styles.selected : ''} onClick={() => setFilter(value)}>{value === 'ACTIVE' ? 'Activas' : value === 'ALL' ? 'Todas' : statusLabels[value]}</button>)}</nav>
      <section className={styles.taskList}>
        {visibleTasks.map((task) => <Link href={`/admin/tasks/${task.id}`} className={styles.taskCard} key={task.id}>
          <div className={`${styles.priority} ${styles[task.priority]}`}>{task.priority === 'NORMAL' ? 'Normal' : task.priority === 'HIGH' ? 'Alta' : 'Urgente'}</div>
          <div className={styles.taskBody}><span>{typeLabels[task.type]} · {task.store.name}</span><h2>{task.title}</h2><p>{task.description}</p><div className={styles.taskMeta}><span>{task.order?.code || task.transfer?.code || task.code}</span><span>{displayName(task.assignedUser)}</span><span>{formatDate(task.dueAt)}</span></div></div>
          <div className={styles.cardStatus}><span className={`${styles.status} ${styles[task.status]}`}>{statusLabels[task.status]}</span><b>→</b></div>
        </Link>)}
        {visibleTasks.length === 0 ? <div className={styles.empty}><div>✓</div><h2>No hay tareas en esta vista</h2><p>Cuando te asignen una separación, recepción o despacho aparecerá aquí.</p></div> : null}
      </section>
    </main>
  );
}
