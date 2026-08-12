'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useAdminUi } from '@/components/admin-ui-provider';

type Plan = { code: string; displayName: string; description?: string | null; planVersionId: string; version: number; currency: string; monthlyPrice: string | null; annualPrice: string | null; limits: { maxProducts: number; maxUsers: number; maxStores: number; maxPosSalesPerMonth: number }; features: string[] };
type Method = { id: string; type: 'BANK_TRANSFER' | 'QR'; name: string; bankName?: string | null; accountHolder?: string | null; accountNumber?: string | null; cci?: string | null; currency: string; qrImageUrl?: string | null; instructions?: string | null };
type PaymentRequest = { id: string; code: string; status: string; billingCycle: string; offeredPrice: string; amountReported?: string | null; operationReference?: string | null; rejectionReason?: string | null; createdAt: string; expiresAt: string; planVersion: { version: number; plan: { code: string; displayName: string } }; paymentMethod: Method };

function makeRequestId() {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
  return `erp_${random.replace(/[^A-Za-z0-9_-]/g, '')}`;
}

export function AdminSubscriptionPanel({ currentPlanCode }: { currentPlanCode: string }) {
  const { showAlert } = useAdminUi();
  const [plans, setPlans] = useState<Plan[]>([]); const [methods, setMethods] = useState<Method[]>([]); const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [planId, setPlanId] = useState(''); const [methodId, setMethodId] = useState(''); const [cycle, setCycle] = useState('MONTHLY');
  const [form, setForm] = useState({ amountReported: '', operationReference: '', paidAt: '', proofUrl: '', applicantNote: '' });
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const requestId = useRef('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogResponse, requestsResponse] = await Promise.all([
        fetch('/api/admin/subscription/catalog', { cache: 'no-store' }),
        fetch('/api/admin/subscription/payment-requests', { cache: 'no-store' }),
      ]);
      const [catalog, history] = await Promise.all([catalogResponse.json().catch(() => null), requestsResponse.json().catch(() => null)]);
      if (!catalogResponse.ok) throw new Error(catalog?.message || 'No se pudo cargar el catálogo.');
      if (!requestsResponse.ok) throw new Error(history?.message || 'No se pudo cargar el historial.');
      const paidPlans = Array.isArray(catalog?.plans) ? catalog.plans.filter((plan: Plan) => plan.code !== 'TRIAL') : [];
      const availableMethods = Array.isArray(catalog?.paymentMethods) ? catalog.paymentMethods : [];
      setPlans(paidPlans); setMethods(availableMethods); setRequests(Array.isArray(history) ? history : []);
      setPlanId((current) => current || paidPlans.find((plan: Plan) => plan.code !== currentPlanCode)?.planVersionId || paidPlans[0]?.planVersionId || '');
      setMethodId((current) => current || availableMethods[0]?.id || '');
    } catch (error) { showAlert(error instanceof Error ? error.message : 'No se pudo cargar la suscripción.', 'error'); }
    finally { setLoading(false); }
  }, [currentPlanCode, showAlert]);
  useEffect(() => { void load(); }, [load]);

  const selectedPlan = plans.find((plan) => plan.planVersionId === planId);
  const selectedMethod = methods.find((method) => method.id === methodId);
  const offeredPrice = cycle === 'ANNUAL' ? selectedPlan?.annualPrice : selectedPlan?.monthlyPrice;

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!selectedPlan || !selectedMethod || !offeredPrice) return;
    if (!requestId.current) requestId.current = makeRequestId();
    setSaving(true);
    try {
      const response = await fetch('/api/admin/subscription/payment-requests', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientRequestId: requestId.current, planVersionId: selectedPlan.planVersionId, paymentMethodId: selectedMethod.id,
          billingCycle: cycle, amountReported: form.amountReported || offeredPrice, operationReference: form.operationReference || undefined,
          paidAt: form.paidAt ? new Date(form.paidAt).toISOString() : undefined, proofUrl: form.proofUrl || undefined, applicantNote: form.applicantNote || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || 'No se pudo enviar la solicitud.');
      showAlert(`Solicitud ${payload.code} enviada. Tu plan aún no ha cambiado.`, 'success');
      requestId.current = ''; setForm({ amountReported: '', operationReference: '', paidAt: '', proofUrl: '', applicantNote: '' }); await load();
    } catch (error) { showAlert(error instanceof Error ? error.message : 'No se pudo enviar la solicitud.', 'error'); }
    finally { setSaving(false); }
  }

  return <article className="admin-card admin-subscription-next"><div className="admin-subscription-title-next"><div><p className="section-kicker">Suscripción</p><h2>Cambiar o renovar plan</h2><p>Plan actual: <strong>{currentPlanCode}</strong>. Enviar un pago no activa el plan: primero lo validará el administrador de la plataforma.</p></div><span className="admin-status-badge warning">Pago manual</span></div>
    {loading ? <p>Cargando planes y medios de pago…</p> : !methods.length ? <div className="admin-inline-alert warning">Aún no hay una cuenta o QR habilitado. Contacta al administrador antes de realizar un pago.</div> : <>
      <div className="admin-plan-options-next">{plans.map((plan) => <button type="button" className={plan.planVersionId === planId ? 'selected' : ''} key={plan.planVersionId} onClick={() => { setPlanId(plan.planVersionId); requestId.current = ''; }}><span>{plan.displayName}</span><strong>{plan.monthlyPrice ? `S/${plan.monthlyPrice}/mes` : 'Consultar'}</strong><small>{plan.limits.maxProducts} productos · {plan.limits.maxUsers} usuarios · {plan.limits.maxStores} tiendas · {plan.limits.maxPosSalesPerMonth} ventas POS</small></button>)}</div>
      <form className="admin-subscription-form-next" onSubmit={submit}><label><span>Ciclo</span><select value={cycle} onChange={(event) => { setCycle(event.target.value); requestId.current = ''; }}><option value="MONTHLY">Mensual</option>{selectedPlan?.annualPrice ? <option value="ANNUAL">Anual</option> : null}</select></label><label><span>Medio utilizado</span><select value={methodId} onChange={(event) => { setMethodId(event.target.value); requestId.current = ''; }}>{methods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label><label><span>Monto reportado</span><input inputMode="decimal" value={form.amountReported || offeredPrice || ''} onChange={(event) => setForm({ ...form, amountReported: event.target.value })} required /></label><label><span>Fecha y hora del pago</span><input type="datetime-local" value={form.paidAt} onChange={(event) => setForm({ ...form, paidAt: event.target.value })} /></label><label><span>Número de operación</span><input value={form.operationReference} maxLength={100} onChange={(event) => setForm({ ...form, operationReference: event.target.value })} /></label><label><span>URL HTTPS de constancia (opcional)</span><input type="url" value={form.proofUrl} onChange={(event) => setForm({ ...form, proofUrl: event.target.value })} placeholder="https://…" /></label><label className="wide"><span>Nota</span><textarea value={form.applicantNote} maxLength={500} onChange={(event) => setForm({ ...form, applicantNote: event.target.value })} /></label><div className="admin-payment-instructions-next wide"><strong>{selectedMethod?.name}</strong>{selectedMethod?.bankName ? <p>{selectedMethod.bankName} · Titular: {selectedMethod.accountHolder}<br />Cuenta: {selectedMethod.accountNumber || '—'} · CCI: {selectedMethod.cci || '—'}</p> : null}{selectedMethod?.qrImageUrl ? <a href={selectedMethod.qrImageUrl} target="_blank" rel="noreferrer">Abrir QR de pago</a> : null}{selectedMethod?.instructions ? <p>{selectedMethod.instructions}</p> : null}<p><strong>Monto esperado: {selectedPlan?.currency} {offeredPrice || '—'}</strong></p></div><button className="admin-primary-btn wide" disabled={saving || !planId || !methodId || !offeredPrice}>{saving ? 'Enviando…' : 'Enviar para validación'}</button></form>
    </>}
    <div className="admin-subscription-history-next"><h3>Solicitudes recientes</h3>{requests.length ? requests.map((request) => <div key={request.id}><div><strong>{request.code}</strong><span>{request.planVersion.plan.displayName} · S/{request.offeredPrice}</span></div><span className={`admin-status-badge ${request.status === 'APPROVED' ? 'success' : request.status === 'PENDING_REVIEW' ? 'warning' : ''}`}>{request.status}</span>{request.rejectionReason ? <small>{request.rejectionReason}</small> : null}</div>) : <p>No hay solicitudes registradas.</p>}</div>
  </article>;
}
