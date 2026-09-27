'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AdminButton, AdminPageHeader } from '@/components/admin-design-system';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { useAdminUi } from '@/components/admin-ui-provider';
import { ADMIN_LIVE_UPDATE_EVENT } from '@/components/admin-shell-provider';
import { AdminWhatsAppConnection } from '@/components/admin-whatsapp-connection';

type Person = { id: number; firstName: string; lastName: string };
type Message = {
  id: string; direction: 'INBOUND' | 'OUTBOUND'; body: string; deliveryStatus: string; sentAt: string;
  sentByUser?: Person | null;
  metadata?: { errorCode?: string; errorMessage?: string } | null;
};
type Conversation = {
  id: string; contactName?: string | null; contactPhone: string; status: string; provider: string;
  unreadCount: number; lastMessageAt: string; assignedUser?: Person | null;
  customer?: { id: number; name: string } | null;
  order?: { id: number; code: string; status: string } | null;
  messages: Message[];
  orderCases?: OrderCase[];
};
type FollowUp = { id: string; body: string; status: string; createdAt: string; completedAt?: string | null };
type OrderCase = { id: string; summary?: string | null; order: { id: number; code: string; status: string }; followUps: FollowUp[] };
type ListPayload = {
  provider: { code: string; simulated: boolean };
  items: Conversation[];
  counts: Record<string, number>;
};
type Metrics = { active: number; unread: number; unassigned: number; resolvedToday: number; averageFirstResponseMinutes: number | null };
type ReplyTemplate = { id: string; title: string; body: string; isActive: boolean };
type LinkOption = { id: number; label: string };

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente', ATTENDING: 'Atendiendo', RESOLVED: 'Resuelta', REOPENED: 'Reabierta',
};
const QUICK_REPLIES = [
  'Hola, gracias por escribirnos. ¿En qué podemos ayudarte?',
  'Estamos validando la disponibilidad y te confirmamos en breve.',
  'Tu pedido ya está listo. Coordinemos la entrega.',
];

function personName(person?: Person | null) {
  return person ? `${person.firstName} ${person.lastName}`.trim() : 'Sin asignar';
}

export function AdminAttentionPage() {
  const { user, hasPermission } = useAdminAuth();
  const { showAlert } = useAdminUi();
  const [payload, setPayload] = useState<ListPayload>({ provider: { code: 'LOCAL', simulated: true }, items: [], counts: {} });
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reply, setReply] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);
  const [users, setUsers] = useState<LinkOption[]>([]);
  const [customers, setCustomers] = useState<LinkOption[]>([]);
  const [orders, setOrders] = useState<LinkOption[]>([]);
  const [newCaseOrderId, setNewCaseOrderId] = useState('');
  const canManage = hasPermission('attention.manage');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'ALL') params.set('status', filter);
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(`/api/admin/attention/conversations?${params}`, { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.message || 'No se pudo cargar la bandeja.'));
      setPayload(data as ListPayload);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'No se pudo cargar la bandeja.', 'error');
    } finally { setLoading(false); }
  }, [filter, search, showAlert]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!canManage) return;
    const requests: Promise<void>[] = [
      fetch('/api/admin/attention/metrics', { cache: 'no-store' }).then((response) => response.json()).then((data) => setMetrics(data as Metrics)).catch(() => undefined),
      fetch('/api/admin/attention/templates', { cache: 'no-store' }).then((response) => response.json()).then((data) => setTemplates(Array.isArray(data) ? data : [])).catch(() => undefined),
      fetch('/api/admin/customers?limit=200', { cache: 'no-store' }).then((response) => response.json()).then((data) => {
        const rows = Array.isArray(data?.data) ? data.data : [];
        setCustomers(rows.map((row: { id: number; name: string }) => ({ id: row.id, label: row.name })));
      }).catch(() => undefined),
      fetch('/api/admin/orders?page=1&limit=100', { cache: 'no-store' }).then((response) => response.json()).then((data) => {
        const rows = Array.isArray(data?.data) ? data.data : [];
        setOrders(rows.map((row: { id: number; code: string; clientName?: string }) => ({ id: row.id, label: `${row.code}${row.clientName ? ` · ${row.clientName}` : ''}` })));
      }).catch(() => undefined),
    ];
    if (hasPermission('users.view')) requests.push(fetch('/api/admin/users', { cache: 'no-store' }).then((response) => response.json()).then((data) => {
      const rows = Array.isArray(data) ? data : [];
      setUsers(rows.filter((row: { isActive?: boolean }) => row.isActive !== false).map((row: Person) => ({ id: row.id, label: personName(row) })));
    }).catch(() => undefined));
    void Promise.all(requests);
  }, [canManage, hasPermission]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ entity?: string; entityId?: string }>).detail;
      if (detail?.entity === 'ATTENTION') {
        void load();
        if (detail.entityId && detail.entityId === selected?.id) {
          void fetch(`/api/admin/attention/conversations/${selected.id}`, { cache: 'no-store' })
            .then(async (response) => response.ok ? await response.json() as Conversation : null)
            .then((conversation) => { if (conversation) setSelected(conversation); });
        }
      }
    };
    window.addEventListener(ADMIN_LIVE_UPDATE_EVENT, refresh);
    return () => window.removeEventListener(ADMIN_LIVE_UPDATE_EVENT, refresh);
  }, [load, selected?.id]);

  async function openConversation(row: Conversation) {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/attention/conversations/${row.id}`, { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.message || 'No se pudo abrir la conversación.'));
      setSelected(data as Conversation);
      if (row.unreadCount > 0 && canManage) await mutate(row.id, { markRead: true }, false);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'No se pudo abrir la conversación.', 'error');
    } finally { setLoading(false); }
  }

  async function mutate(id: string, body: Record<string, unknown>, refresh = true) {
    const response = await fetch(`/api/admin/attention/conversations/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(String(data?.message || 'No se pudo actualizar la conversación.'));
    if (refresh) {
      const detail = await fetch(`/api/admin/attention/conversations/${id}`, { cache: 'no-store' });
      setSelected(detail.ok ? await detail.json() as Conversation : data as Conversation);
      await load();
    }
    return data;
  }

  async function createConversation(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch('/api/admin/attention/conversations', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contactPhone: newPhone, contactName: newName, initialMessage }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.message || 'No se pudo crear la conversación.'));
      setNewOpen(false); setNewPhone(''); setNewName(''); setInitialMessage('');
      await load(); await openConversation(data as Conversation);
    } catch (error) { showAlert(error instanceof Error ? error.message : 'No se pudo crear.', 'error'); }
    finally { setSaving(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected || !reply.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/attention/conversations/${selected.id}/messages`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: reply }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`${data?.message || 'No se pudo registrar la respuesta.'}${data?.code ? ` (código ${data.code})` : ''}`);
      setReply(''); await openConversation(selected); await load();
    } catch (error) { showAlert(error instanceof Error ? error.message : 'No se pudo responder.', 'error'); }
    finally { setSaving(false); }
  }

  async function simulateInbound() {
    if (!selected) return;
    const body = window.prompt('Mensaje entrante de prueba');
    if (!body?.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/attention/conversations/${selected.id}/messages/local-inbound`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.message || 'No se pudo simular el mensaje.'));
      await openConversation(selected); await load();
    } catch (error) { showAlert(error instanceof Error ? error.message : 'No se pudo simular.', 'error'); }
    finally { setSaving(false); }
  }

  async function createTemplate() {
    const title = window.prompt('Nombre de la respuesta rápida')?.trim();
    if (!title) return;
    const body = window.prompt('Contenido de la respuesta')?.trim();
    if (!body) return;
    try {
      const response = await fetch('/api/admin/attention/templates', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, body }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.message || 'No se pudo crear la plantilla.'));
      setTemplates((current) => [...current, data as ReplyTemplate]);
    } catch (error) { showAlert(error instanceof Error ? error.message : 'No se pudo crear la plantilla.', 'error'); }
  }

  async function changeCase(endpoint: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/attention/${endpoint}`, {
        method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.message || 'No se pudo actualizar el seguimiento.'));
      await openConversation(selected);
      await load();
    } catch (error) { showAlert(error instanceof Error ? error.message : 'No se pudo actualizar el seguimiento.', 'error'); }
    finally { setSaving(false); }
  }

  function editSummary(orderCase: OrderCase) {
    const summary = window.prompt('Resumen de lo acordado con el cliente', orderCase.summary || '');
    if (summary === null) return;
    void changeCase(`cases/${orderCase.id}/summary`, 'PATCH', { summary });
  }

  function addFollowUp(orderCase: OrderCase) {
    const body = window.prompt('Nueva nota de seguimiento')?.trim();
    if (!body) return;
    void changeCase(`cases/${orderCase.id}/notes`, 'POST', { body });
  }

  async function linkAnotherOrder() {
    if (!selected || !newCaseOrderId) return;
    await changeCase(`conversations/${selected.id}/orders`, 'POST', { orderId: Number(newCaseOrderId) });
    setNewCaseOrderId('');
  }

  const activeCount = useMemo(() => ['PENDING', 'ATTENDING', 'REOPENED'].reduce((sum, key) => sum + Number(payload.counts[key] || 0), 0), [payload.counts]);

  return <section className="admin-dashboard-grid attention-page-next">
    <AdminPageHeader eyebrow="Ventas y atención" title="Bandeja de atención" description="Gestiona conversaciones y vincúlalas con clientes y pedidos." actions={canManage ? <AdminButton onClick={() => setNewOpen(true)}>Nueva conversación</AdminButton> : undefined} />
    <AdminWhatsAppConnection />
    {payload.provider.simulated ? <article className="admin-notice info"><strong>Modo local activo.</strong> Los mensajes quedan registrados y auditables, pero todavía no se envían a Meta WhatsApp.</article> : null}
    {payload.provider.code === 'META_UNAVAILABLE' ? <article className="admin-notice warning"><strong>WhatsApp no disponible.</strong> Revisa la conexión de la empresa antes de enviar mensajes.</article> : null}
    <section className="dashboard-kpi-grid-next">
      <article className="dashboard-kpi-card-next"><p>Activas</p><strong>{activeCount}</strong><span>Pendientes o atendiendo</span></article>
      <article className="dashboard-kpi-card-next"><p>Sin leer</p><strong>{payload.items.reduce((sum, row) => sum + row.unreadCount, 0)}</strong><span>Mensajes entrantes</span></article>
      <article className="dashboard-kpi-card-next"><p>Resueltas</p><strong>{payload.counts.RESOLVED || 0}</strong><span>Conversaciones cerradas</span></article>
      <article className="dashboard-kpi-card-next"><p>Primera respuesta</p><strong>{metrics?.averageFirstResponseMinutes == null ? '—' : `${metrics.averageFirstResponseMinutes} min`}</strong><span>Promedio registrado</span></article>
    </section>
    <article className="admin-card attention-toolbar-next">
      <input type="search" value={search} placeholder="Cliente, teléfono o pedido" onChange={(event) => setSearch(event.target.value)} />
      <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">Todos los estados</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <button className="admin-ghost-btn" type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Cargando…' : 'Buscar'}</button>
    </article>
    <div className="attention-workspace-next">
      <article className="admin-card attention-list-next">
        {payload.items.length === 0 ? <p className="admin-muted-text">No hay conversaciones en esta vista.</p> : payload.items.map((row) => <button type="button" key={row.id} className={`attention-row-next${selected?.id === row.id ? ' is-active' : ''}`} onClick={() => void openConversation(row)}>
          <span><strong>{row.contactName || row.customer?.name || row.contactPhone}</strong><small>{row.messages[0]?.body || 'Sin mensajes'}</small></span>
          <span><small>{STATUS_LABEL[row.status] || row.status}</small>{row.unreadCount ? <b>{row.unreadCount}</b> : null}</span>
        </button>)}
      </article>
      <article className="admin-card attention-detail-next">
        {!selected ? <p className="admin-muted-text">Selecciona una conversación para atenderla.</p> : <>
          <header><div><h2>{selected.contactName || selected.customer?.name || selected.contactPhone}</h2><p>{selected.contactPhone} · {personName(selected.assignedUser)}</p></div><span className="admin-pill warning">{STATUS_LABEL[selected.status] || selected.status}</span></header>
          <div className="admin-table-actions">
            {selected.customer ? <Link className="admin-ghost-btn" href={`/admin/customers?search=${encodeURIComponent(selected.customer.name)}`}>Ver cliente</Link> : null}
            {selected.order ? <Link className="admin-ghost-btn" href={`/admin/orders/${selected.order.id}`}>Pedido {selected.order.code}</Link> : null}
            {canManage && selected.assignedUser?.id !== user?.id ? <button className="admin-ghost-btn" type="button" onClick={() => void mutate(selected.id, { assignedUserId: user?.id })}>Asignarme</button> : null}
            {canManage ? <button className="admin-ghost-btn" type="button" onClick={() => void mutate(selected.id, { status: selected.status === 'RESOLVED' ? 'REOPENED' : 'RESOLVED' })}>{selected.status === 'RESOLVED' ? 'Reabrir' : 'Resolver'}</button> : null}
            {canManage && payload.provider.simulated ? <button className="admin-ghost-btn" type="button" onClick={() => void simulateInbound()}>Simular entrada</button> : null}
          </div>
          {canManage ? <div className="attention-links-next">
            {users.length ? <label><span>Responsable</span><select value={selected.assignedUser?.id || ''} onChange={(event) => void mutate(selected.id, { assignedUserId: event.target.value ? Number(event.target.value) : null })}><option value="">Sin asignar</option>{users.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label> : null}
            <label><span>Cliente vinculado</span><select value={selected.customer?.id || ''} onChange={(event) => void mutate(selected.id, { customerId: event.target.value ? Number(event.target.value) : null })}><option value="">Sin cliente</option>{customers.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            <label><span>Pedido vinculado</span><select value={selected.order?.id || ''} onChange={(event) => void mutate(selected.id, { orderId: event.target.value ? Number(event.target.value) : null })}><option value="">Sin pedido</option>{orders.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          </div> : null}
          <section className="admin-card" aria-label="Seguimiento de pedidos">
            <h3>Pedidos y acuerdos</h3>
            {canManage ? <div className="admin-table-actions">
              <select aria-label="Vincular otro pedido" value={newCaseOrderId} onChange={(event) => setNewCaseOrderId(event.target.value)}>
                <option value="">Seleccionar otro pedido</option>
                {orders.filter((option) => !selected.orderCases?.some((item) => item.order.id === option.id)).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <button className="admin-ghost-btn" type="button" disabled={saving || !newCaseOrderId} onClick={() => void linkAnotherOrder()}>Vincular pedido</button>
            </div> : null}
            {selected.orderCases?.length ? selected.orderCases.map((orderCase) => <article key={orderCase.id}>
              <h4><Link href={`/admin/orders/${orderCase.order.id}`}>Pedido {orderCase.order.code}</Link></h4>
              <p><strong>Resumen acordado:</strong> {orderCase.summary || 'Sin resumen todavía'}</p>
              {canManage ? <div className="admin-table-actions">
                <button className="admin-ghost-btn" type="button" disabled={saving} onClick={() => editSummary(orderCase)}>Editar resumen</button>
                <button className="admin-ghost-btn" type="button" disabled={saving} onClick={() => addFollowUp(orderCase)}>+ Nota de seguimiento</button>
              </div> : null}
              {orderCase.followUps.length ? <ul>{orderCase.followUps.map((note) => <li key={note.id}>
                <span>{note.body} · {note.status === 'COMPLETED' ? 'Completada' : note.status === 'IN_PROGRESS' ? 'En curso' : 'Pendiente'}</span>
                {canManage ? <select aria-label={`Estado de nota: ${note.body}`} value={note.status} disabled={saving}
                  onChange={(event) => void changeCase(`notes/${note.id}`, 'PATCH', { status: event.target.value })}>
                  <option value="PENDING">Pendiente</option><option value="IN_PROGRESS">En curso</option><option value="COMPLETED">Completada</option>
                </select> : null}
              </li>)}</ul> : <p className="admin-muted-text">Aún no hay notas para este pedido.</p>}
            </article>) : <p className="admin-muted-text">Vincula un pedido para registrar acuerdos y notas.</p>}
          </section>
          <div className="attention-messages-next">{selected.messages.map((message) => <div key={message.id} className={`attention-message-next ${message.direction === 'OUTBOUND' ? 'outbound' : 'inbound'}`}><p>{message.body}</p><small>{message.sentByUser ? personName(message.sentByUser) : 'Cliente'} · {new Date(message.sentAt).toLocaleString('es-PE')} · {message.deliveryStatus}</small>{message.deliveryStatus === 'FAILED' ? <p role="alert">{message.metadata?.errorMessage || 'Meta rechazó la entrega.'}{message.metadata?.errorCode ? ` (código ${message.metadata.errorCode})` : ''}</p> : null}</div>)}</div>
          {canManage ? <><div className="admin-table-actions">{(templates.length ? templates.map((item) => item.body) : QUICK_REPLIES).map((value, index) => <button key={`${value}-${index}`} type="button" className="admin-ghost-btn" onClick={() => setReply(value)}>Respuesta {index + 1}</button>)}<button type="button" className="admin-ghost-btn" onClick={() => void createTemplate()}>+ Plantilla</button></div><form className="attention-reply-next" onSubmit={send}><textarea value={reply} maxLength={4000} placeholder="Escribe una respuesta…" onChange={(event) => setReply(event.target.value)} /><button className="admin-primary-btn" disabled={saving || !reply.trim() || payload.provider.code === 'META_UNAVAILABLE'}>{saving ? 'Guardando…' : payload.provider.simulated ? 'Registrar respuesta' : 'Enviar'}</button></form></> : null}
        </>}
      </article>
    </div>
    {newOpen ? <div className="admin-modal-overlay" role="presentation" onClick={() => setNewOpen(false)}><article className="admin-modal-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><header className="admin-modal-head-next"><h3>Nueva conversación local</h3><button className="admin-modal-close-next" onClick={() => setNewOpen(false)}>×</button></header><form className="admin-modal-form" onSubmit={createConversation}><label><span>Nombre</span><input value={newName} onChange={(event) => setNewName(event.target.value)} /></label><label><span>WhatsApp *</span><input value={newPhone} required placeholder="999 999 999" onChange={(event) => setNewPhone(event.target.value)} /></label><label><span>Mensaje inicial recibido</span><textarea value={initialMessage} onChange={(event) => setInitialMessage(event.target.value)} /></label><div className="admin-modal-actions"><button type="button" className="admin-ghost-btn" onClick={() => setNewOpen(false)}>Cancelar</button><button className="admin-primary-btn" disabled={saving}>{saving ? 'Creando…' : 'Crear'}</button></div></form></article></div> : null}
  </section>;
}
