'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminOrderItem } from '@/lib/admin-order-types';

// Devolucion post-entrega (G4): registra devoluciones parciales por item de un
// pedido DELIVERED. Repone stock en el backend; la Nota de Credito SUNAT se
// emite aparte en /admin/sunat/comprobantes (motivo 06/07).

interface OrderReturnLine {
  id: number;
  orderItemId: number;
  variantId: number;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface OrderReturnRecord {
  id: number;
  reason: string;
  note?: string | null;
  totalQuantity: number;
  totalAmount: number;
  createdAt: string;
  items: OrderReturnLine[];
}

interface AdminOrderReturnPanelProps {
  orderId: number;
  orderCode: string;
  items: AdminOrderItem[];
  onChange?: () => void;
}

function formatMoney(value: number): string {
  return `S/ ${Number(value || 0).toFixed(2)}`;
}

function itemLabel(item: AdminOrderItem): { name: string; variant: string } {
  const name = item.variant?.productName || 'Producto';
  const variant = [item.variant?.colorName, item.variant?.sizeName]
    .filter((v) => (v || '').trim().length > 0)
    .join(' / ');
  return { name, variant };
}

export function AdminOrderReturnPanel({ orderId, orderCode, items, onChange }: AdminOrderReturnPanelProps) {
  const [returns, setReturns] = useState<OrderReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activeItems = useMemo(
    () => items.filter((it) => !it.removed && !it.removedAt),
    [items],
  );

  const loadReturns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/returns`, {
        method: 'GET',
        cache: 'no-store',
      }).catch(() => null);
      const payload = res ? await res.json().catch(() => null) : null;
      const data = Array.isArray(payload?.data) ? (payload.data as OrderReturnRecord[]) : [];
      setReturns(data);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadReturns();
  }, [loadReturns]);

  // Unidades ya devueltas por linea, sumadas del historial.
  const returnedByItem = useMemo(() => {
    const map: Record<number, number> = {};
    for (const record of returns) {
      for (const line of record.items || []) {
        map[line.orderItemId] = Number(map[line.orderItemId] || 0) + Number(line.quantity || 0);
      }
    }
    return map;
  }, [returns]);

  const rows = useMemo(
    () =>
      activeItems.map((item) => {
        const orderItemId = Number(item.orderItemId ?? item.id);
        const delivered = Math.max(0, Number(item.quantity || 0) - Number(item.shortageQuantity || 0));
        const already = Number(returnedByItem[orderItemId] || 0);
        const remaining = Math.max(0, delivered - already);
        return { orderItemId, item, delivered, already, remaining };
      }),
    [activeItems, returnedByItem],
  );

  const totalToReturn = useMemo(
    () => rows.reduce((sum, row) => sum + Number(quantities[row.orderItemId] || 0), 0),
    [rows, quantities],
  );

  const allReturned = rows.length > 0 && rows.every((row) => row.remaining === 0);

  const setQty = (orderItemId: number, value: number, max: number) => {
    const clamped = Math.max(0, Math.min(max, Math.floor(Number.isFinite(value) ? value : 0)));
    setQuantities((prev) => ({ ...prev, [orderItemId]: clamped }));
  };

  const submit = async () => {
    setError('');
    setSuccess('');
    const payloadItems = rows
      .map((row) => ({ orderItemId: row.orderItemId, quantity: Number(quantities[row.orderItemId] || 0) }))
      .filter((line) => line.quantity > 0);

    if (payloadItems.length === 0) {
      setError('Indica al menos una cantidad a devolver.');
      return;
    }
    if (!reason.trim()) {
      setError('Indica el motivo de la devolucion.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/returns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim(), note: note.trim() || null, items: payloadItems }),
      }).catch(() => null);
      const payload = res ? await res.json().catch(() => null) : null;
      if (!res || !res.ok) {
        setError(String(payload?.error || payload?.message || 'No se pudo registrar la devolucion.'));
        return;
      }
      setSuccess('Devolucion registrada. Stock repuesto en la tienda de despacho.');
      setQuantities({});
      setReason('');
      setNote('');
      await loadReturns();
      onChange?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="order-return-panel">
      <header className="orp-head">
        <h3>Devoluciones</h3>
        <Link className="admin-ghost-btn" href="/admin/sunat/comprobantes">
          Emitir Nota de Credito
        </Link>
      </header>
      <p className="orp-hint">
        Al registrar una devolucion se repone el stock a la tienda de despacho. La Nota de Credito SUNAT se
        emite aparte: busca el pedido <strong>{orderCode}</strong> en Comprobantes (motivo 06 total / 07 por item).
      </p>

      {!allReturned ? (
        <div className="orp-form">
          <div className="orp-lines">
            {rows.map((row) => {
              const { name, variant } = itemLabel(row.item);
              return (
                <div key={row.orderItemId} className={`orp-line${row.remaining === 0 ? ' is-complete' : ''}`}>
                  <div className="orp-line-info">
                    <strong>{name}</strong>
                    {variant ? <span>{variant}</span> : null}
                    <small>
                      Entregado {row.delivered} · Devuelto {row.already} · Disponible {row.remaining}
                    </small>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={row.remaining}
                    value={quantities[row.orderItemId] ?? ''}
                    disabled={row.remaining === 0}
                    onChange={(event) => setQty(row.orderItemId, Number(event.target.value), row.remaining)}
                    placeholder="0"
                    aria-label={`Cantidad a devolver de ${name}`}
                  />
                </div>
              );
            })}
          </div>

          <label className="orp-field">
            Motivo
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ej. Producto defectuoso"
            />
          </label>
          <label className="orp-field">
            Nota (opcional)
            <input type="text" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>

          {error ? <p className="orp-error">{error}</p> : null}
          {success ? <p className="orp-success">{success}</p> : null}

          <button
            type="button"
            className="admin-primary-btn"
            onClick={() => void submit()}
            disabled={submitting || totalToReturn === 0}
          >
            {submitting ? 'Registrando...' : `Registrar devolucion (${totalToReturn})`}
          </button>
        </div>
      ) : (
        <p className="orp-complete-msg">Todas las unidades entregadas fueron devueltas.</p>
      )}

      <div className="orp-history">
        <h4>Historial de devoluciones</h4>
        {loading ? <p className="orp-muted">Cargando...</p> : null}
        {!loading && returns.length === 0 ? <p className="orp-muted">Sin devoluciones registradas.</p> : null}
        {returns.map((record) => (
          <article key={record.id} className="orp-history-row">
            <div className="orp-history-head">
              <strong>{new Date(record.createdAt).toLocaleString('es-PE')}</strong>
              <span>
                {record.totalQuantity} und · {formatMoney(Number(record.totalAmount))}
              </span>
            </div>
            <p className="orp-history-reason">
              {record.reason}
              {record.note ? ` — ${record.note}` : ''}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
