'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/components/admin-auth-provider';

type OrderCase = {
  id: string; summary?: string | null;
  conversation: { id: string; contactName?: string | null; contactPhone: string };
  followUps: Array<{ id: string; body: string; status: string; createdAt: string; completedAt?: string | null }>;
};

export function AdminOrderAttentionFollowUps({ orderId }: { orderId: number }) {
  const { hasFeature, hasPermission } = useAdminAuth();
  const [cases, setCases] = useState<OrderCase[]>([]);
  const [loaded, setLoaded] = useState(false);
  const visible = hasFeature('attention.inbox') && hasPermission('attention.view');
  useEffect(() => {
    if (!visible) return;
    void fetch(`/api/admin/attention/orders/${orderId}/cases`, { cache: 'no-store' })
      .then(async (response) => response.ok ? await response.json() as OrderCase[] : [])
      .then((rows) => setCases(rows)).catch(() => setCases([])).finally(() => setLoaded(true));
  }, [orderId, visible]);
  if (!visible || !loaded || cases.length === 0) return null;
  return <article className="admin-card">
    <h3>Acuerdos por WhatsApp</h3>
    {cases.map((item) => <section key={item.id}>
      <p><strong>{item.conversation.contactName || item.conversation.contactPhone}</strong> · <Link href="/admin/attention">Abrir bandeja</Link></p>
      <p><strong>Resumen:</strong> {item.summary || 'Sin resumen'}</p>
      <ul>{item.followUps.map((note) => <li key={note.id}>{note.body} · {note.status === 'COMPLETED' ? 'Completada' : note.status === 'IN_PROGRESS' ? 'En curso' : 'Pendiente'}</li>)}</ul>
    </section>)}
  </article>;
}
