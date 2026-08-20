'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useAdminUi } from '@/components/admin-ui-provider';
import { useAdminShell } from '@/components/admin-shell-provider';
import { fileToBase64 } from '@/lib/product-form-utils';

type Plan = { code: string; displayName: string; planVersionId: string; currency: string; monthlyPrice: string | null; annualPrice: string | null; limits: { maxProducts: number; maxUsers: number; maxStores: number; maxPosSalesPerMonth: number } };
type Method = { id: string; type: 'BANK_TRANSFER' | 'QR'; name: string; bankName?: string | null; accountHolder?: string | null; accountNumber?: string | null; cci?: string | null; currency: string; qrImageUrl?: string | null; instructions?: string | null };
type PaymentRequest = { id: string; code: string; status: string; offeredPrice: string; createdAt?: string; rejectionReason?: string | null; planVersion: { plan: { displayName: string } } };
type Choice = { id: string | number; label: string; detail?: string; required?: boolean };
type DowngradePreview = {
  isDowngrade: boolean; requiresSelection: boolean;
  limits: { users: number; products: number; stores: number };
  conflicts: { users: number; products: number; stores: number };
  users: Choice[]; products: Choice[]; stores: Choice[];
  suggested: { userIds: string[]; productIds: number[]; storeIds: number[] };
};

function makeRequestId() {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
  return `erp_${random.replace(/[^A-Za-z0-9_-]/g, '')}`;
}

const requestStatus: Record<string, { label: string; tone: string; detail: string }> = {
  PENDING_REVIEW: { label: 'En validación', tone: 'warning', detail: 'Revisaremos tu comprobante y te avisaremos cuando el plan esté activo.' },
  APPROVED: { label: 'Aprobado', tone: 'success', detail: 'El pago fue validado y el plan quedó aplicado.' },
  REJECTED: { label: 'Observado', tone: 'error', detail: 'La solicitud necesita una corrección antes de continuar.' },
  EXPIRED: { label: 'Vencido', tone: 'error', detail: 'La solicitud venció; puedes enviar un comprobante nuevo.' },
  CANCELLED: { label: 'Cancelado', tone: 'info', detail: 'Esta solicitud ya no está activa.' },
};

function moneyLabel(currency: string | undefined, value: string | null | undefined) {
  return value ? `${currency === 'PEN' ? 'S/' : `${currency || ''} `}${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'No disponible';
}

export function AdminSubscriptionPanel({ currentPlanCode }: { currentPlanCode: string }) {
  const { showAlert } = useAdminUi();
  const { refreshPendingAssignments } = useAdminShell();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [planId, setPlanId] = useState(''); const [methodId, setMethodId] = useState(''); const [cycle, setCycle] = useState('MONTHLY');
  const [form, setForm] = useState({ amountReported: '', operationReference: '', paidAt: '', applicantNote: '' });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [downgrade, setDowngrade] = useState<DowngradePreview | null>(null);
  const [selection, setSelection] = useState({ userIds: [] as string[], productIds: [] as number[], storeIds: [] as number[] });
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
    } catch (caught) { showAlert(caught instanceof Error ? caught.message : 'No se pudo cargar la suscripción.', 'error'); }
    finally { setLoading(false); }
  }, [currentPlanCode, showAlert]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!planId) { setDowngrade(null); return; }
    let cancelled = false;
    fetch(`/api/admin/subscription/downgrade-preview/${encodeURIComponent(planId)}`, { cache: 'no-store' })
      .then(async (response) => { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.message || 'No se pudo revisar el cambio de plan.'); return payload; })
      .then((preview: DowngradePreview) => {
        if (cancelled) return;
        setDowngrade(preview);
        setSelection(preview.suggested);
      })
      .catch((caught) => { if (!cancelled) showAlert(caught instanceof Error ? caught.message : 'No se pudo revisar el cambio de plan.', 'error'); });
    return () => { cancelled = true; };
  }, [planId, showAlert]);

  const selectedPlan = plans.find((plan) => plan.planVersionId === planId);
  const selectedMethod = methods.find((method) => method.id === methodId);
  const offeredPrice = cycle === 'ANNUAL' ? selectedPlan?.annualPrice : selectedPlan?.monthlyPrice;

  async function copyValue(value: string | null | undefined, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showAlert(`${label} copiado.`, 'success');
    } catch {
      showAlert(`No se pudo copiar ${label.toLowerCase()}.`, 'warning');
    }
  }

  function toggle<T extends string | number>(field: 'userIds' | 'productIds' | 'storeIds', id: T, checked: boolean, limit: number) {
    setSelection((current) => {
      const values = current[field] as T[];
      if (checked && !values.includes(id) && values.length >= limit) {
        showAlert(`Solo puedes mantener ${limit} recurso(s) de este grupo.`, 'warning');
        return current;
      }
      return { ...current, [field]: checked ? [...values, id] : values.filter((value) => value !== id) };
    });
    requestId.current = '';
  }

  function choices(title: string, items: Choice[], field: 'userIds' | 'productIds' | 'storeIds', limit: number) {
    const selected = selection[field] as Array<string | number>;
    return <section className="admin-downgrade-group"><div><h5>{title}</h5><span>{selected.length}/{limit} activos</span></div><div className="admin-downgrade-options">{items.map((item) => <label key={String(item.id)} className={selected.includes(item.id) ? 'selected' : ''}><input type="checkbox" checked={selected.includes(item.id)} disabled={item.required} onChange={(event) => toggle(field, item.id, event.target.checked, limit)} /><span><strong>{item.label}</strong>{item.detail ? <small>{item.detail}</small> : null}{item.required ? <small>Obligatorio</small> : null}</span></label>)}</div></section>;
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!selectedPlan || !selectedMethod || !offeredPrice) return;
    if (!proofFile) { showAlert('Adjunta tu comprobante de pago para enviar la solicitud.', 'warning'); return; }
    if (proofFile.size > 5 * 1024 * 1024) { showAlert('El comprobante debe pesar como máximo 5 MB.', 'warning'); return; }
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(proofFile.type)) {
      showAlert('El comprobante debe ser PDF, JPG, PNG o WebP.', 'warning'); return;
    }
    if (!requestId.current) requestId.current = makeRequestId();
    setSaving(true);
    try {
      const response = await fetch('/api/admin/subscription/payment-requests', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientRequestId: requestId.current, planVersionId: selectedPlan.planVersionId, paymentMethodId: selectedMethod.id,
          billingCycle: cycle, amountReported: form.amountReported || offeredPrice, operationReference: form.operationReference || undefined,
          paidAt: form.paidAt ? new Date(form.paidAt).toISOString() : undefined,
          ...(proofFile ? { proofFile: { filename: proofFile.name, data: await fileToBase64(proofFile) } } : {}),
          applicantNote: form.applicantNote || undefined,
          ...(downgrade?.isDowngrade ? { downgradeSelection: selection } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || 'No se pudo enviar la solicitud.');
      showAlert(`Solicitud ${payload.code} enviada. Tu plan aún no ha cambiado.`, 'success');
      requestId.current = ''; setForm({ amountReported: '', operationReference: '', paidAt: '', applicantNote: '' }); setProofFile(null); await load(); await refreshPendingAssignments();
    } catch (caught) { showAlert(caught instanceof Error ? caught.message : 'No se pudo enviar la solicitud.', 'error'); }
    finally { setSaving(false); }
  }

  return <article className="admin-card admin-subscription-next" id="planes-y-pago">
    <div className="admin-subscription-title-next">
      <div><p className="section-kicker">Planes y facturación</p><h2>Elige el plan que acompaña tu negocio</h2><p>Sin cobros automáticos. Tú realizas el pago y nosotros activamos el plan después de validarlo.</p></div>
      <span className="admin-status-badge warning">Pago 100% manual</span>
    </div>

    <ol className="admin-payment-steps-next" aria-label="Proceso de activación">
      <li className="active"><span>1</span><div><strong>Elige tu plan</strong><small>Compara capacidades</small></div></li>
      <li><span>2</span><div><strong>Realiza el pago</strong><small>Transferencia o QR</small></div></li>
      <li><span>3</span><div><strong>Validamos</strong><small>Activación por superadmin</small></div></li>
    </ol>

    {loading ? <div className="admin-subscription-loading-next"><span /><p>Cargando planes y medios de pago…</p></div> : !methods.length ? <div className="admin-empty-payment-next"><strong>No hay medios de pago disponibles</strong><p>El administrador de la plataforma debe publicar una cuenta bancaria o QR antes de recibir solicitudes.</p></div> : <>
      <section className="admin-plan-section-next" aria-labelledby="choose-plan-title">
        <div className="admin-subsection-heading-next"><div><span className="admin-step-kicker-next">Paso 1</span><h3 id="choose-plan-title">Selecciona un plan</h3></div><p>Tu plan actual es <strong>{currentPlanCode}</strong></p></div>
        <div className="admin-plan-options-next">{plans.map((plan) => {
          const selected = plan.planVersionId === planId;
          const current = plan.code === currentPlanCode;
          return <button type="button" aria-pressed={selected} className={`${selected ? 'selected' : ''} ${current ? 'current' : ''}`} key={plan.planVersionId} onClick={() => { setPlanId(plan.planVersionId); requestId.current = ''; }}>
            <span className="admin-plan-card-head-next"><span>{plan.displayName}</span>{current ? <small>PLAN ACTUAL</small> : selected ? <small>ELEGIDO</small> : null}</span>
            <strong className="admin-plan-price-next">{moneyLabel(plan.currency, plan.monthlyPrice)}<small>/ mes</small></strong>
            {plan.annualPrice ? <span className="admin-plan-annual-next">o {moneyLabel(plan.currency, plan.annualPrice)} al año</span> : <span className="admin-plan-annual-next">Facturación mensual</span>}
            <span className="admin-plan-limit-grid-next"><small><b>{plan.limits.maxProducts}</b> productos</small><small><b>{plan.limits.maxUsers}</b> usuarios</small><small><b>{plan.limits.maxStores}</b> tiendas</small><small><b>{plan.limits.maxPosSalesPerMonth}</b> ventas POS</small></span>
            <span className="admin-plan-select-label-next">{selected ? 'Plan seleccionado' : current ? 'Renovar este plan' : 'Elegir este plan'} <b>→</b></span>
          </button>;
        })}</div>
      </section>

      {downgrade?.isDowngrade ? <div className="admin-downgrade-assistant"><div className="admin-inline-alert warning"><strong>Este cambio reduce algunas capacidades</strong><p>Elige qué recursos seguirán activos. Los demás quedarán en consulta; nunca borraremos tu información.</p></div>{choices('Usuarios e invitaciones', downgrade.users, 'userIds', downgrade.limits.users)}{choices('Productos', downgrade.products, 'productIds', downgrade.limits.products)}{choices('Tiendas', downgrade.stores, 'storeIds', downgrade.limits.stores)}</div> : null}

      <form className="admin-subscription-checkout-next" onSubmit={submit}>
        <section className="admin-payment-guide-next">
          <div className="admin-subsection-heading-next"><div><span className="admin-step-kicker-next">Paso 2</span><h3>Realiza el pago</h3></div></div>
          <div className="admin-cycle-switch-next" aria-label="Ciclo de facturación">
            <button type="button" className={cycle === 'MONTHLY' ? 'active' : ''} onClick={() => { setCycle('MONTHLY'); requestId.current = ''; }}>Mensual</button>
            {selectedPlan?.annualPrice ? <button type="button" className={cycle === 'ANNUAL' ? 'active' : ''} onClick={() => { setCycle('ANNUAL'); requestId.current = ''; }}>Anual</button> : null}
          </div>
          <div className="admin-method-picker-next">{methods.map((method) => <button type="button" key={method.id} className={method.id === methodId ? 'selected' : ''} onClick={() => { setMethodId(method.id); requestId.current = ''; }}><span>{method.type === 'QR' ? 'QR' : 'BANCO'}</span><strong>{method.name}</strong><small>{method.bankName || 'Pago con código QR'}</small></button>)}</div>
          <div className="admin-payment-instructions-next">
            <div className="admin-payment-amount-next"><span>Monto exacto a pagar</span><strong>{moneyLabel(selectedPlan?.currency, offeredPrice)}</strong><small>{cycle === 'ANNUAL' ? 'Pago por 12 meses' : 'Pago por 1 mes'}</small></div>
            <div className="admin-payment-data-next">
              {selectedMethod?.bankName ? <><p><span>Banco</span><strong>{selectedMethod.bankName}</strong></p><p><span>Titular</span><strong>{selectedMethod.accountHolder || '—'}</strong></p>{selectedMethod.accountNumber ? <p><span>Cuenta</span><strong>{selectedMethod.accountNumber}</strong><button type="button" onClick={() => void copyValue(selectedMethod.accountNumber, 'Cuenta')}>Copiar</button></p> : null}{selectedMethod.cci ? <p><span>CCI</span><strong>{selectedMethod.cci}</strong><button type="button" onClick={() => void copyValue(selectedMethod.cci, 'CCI')}>Copiar</button></p> : null}</> : null}
              {selectedMethod?.qrImageUrl ? <a className="admin-qr-link-next" href={selectedMethod.qrImageUrl} target="_blank" rel="noreferrer">Abrir código QR <span>↗</span></a> : null}
            </div>
            {selectedMethod?.instructions ? <p className="admin-method-note-next">{selectedMethod.instructions}</p> : null}
          </div>
        </section>

        <section className="admin-proof-form-next">
          <div className="admin-subsection-heading-next"><div><span className="admin-step-kicker-next">Paso 3</span><h3>Reporta tu pago</h3></div></div>
          <p className="admin-proof-intro-next">Completa los datos tal como aparecen en tu comprobante.</p>
          <div className="admin-proof-fields-next">
            <label><span>Número de operación</span><input value={form.operationReference} maxLength={100} placeholder="Ej. 0123456789" required onChange={(event) => setForm({ ...form, operationReference: event.target.value })} /></label>
            <label><span>Fecha y hora del pago</span><input type="datetime-local" value={form.paidAt} required onChange={(event) => setForm({ ...form, paidAt: event.target.value })} /></label>
            <label className={`admin-proof-dropzone-next ${proofFile ? 'has-file' : ''}`}><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required onChange={(event) => { setProofFile(event.target.files?.[0] || null); requestId.current = ''; }} /><span className="admin-proof-icon-next">↑</span><strong>{proofFile ? proofFile.name : 'Sube tu comprobante'}</strong><small>{proofFile ? `${(proofFile.size / 1048576).toLocaleString('es-PE', { maximumFractionDigits: 2 })} MB · Clic para reemplazar` : 'PDF, JPG, PNG o WebP · máximo 5 MB'}</small></label>
            <label><span>Nota para el revisor <small>(opcional)</small></span><textarea value={form.applicantNote} maxLength={500} placeholder="Agrega alguna precisión sobre el pago" onChange={(event) => setForm({ ...form, applicantNote: event.target.value })} /></label>
          </div>
          <div className="admin-payment-summary-next"><span>Solicitud</span><strong>{selectedPlan?.displayName || '—'} · {cycle === 'ANNUAL' ? 'Anual' : 'Mensual'}</strong><b>{moneyLabel(selectedPlan?.currency, offeredPrice)}</b></div>
          <button className="admin-primary-btn admin-payment-submit-next" disabled={saving || !planId || !methodId || !offeredPrice || !proofFile}>{saving ? 'Enviando comprobante…' : 'Enviar pago para validación'}</button>
          <p className="admin-payment-security-next">🔒 Tu comprobante se cifra y solo puede verlo el superadmin.</p>
        </section>
      </form>
    </>}

    <section className="admin-subscription-history-next" id="seguimiento-pagos">
      <div className="admin-subsection-heading-next"><div><span className="admin-step-kicker-next">Seguimiento</span><h3>Solicitudes recientes</h3></div><small>{requests.length} registrada(s)</small></div>
      {requests.length ? <div className="admin-request-list-next">{requests.map((request) => {
        const status = requestStatus[request.status] || { label: request.status, tone: 'info', detail: 'Consulta el estado de esta solicitud.' };
        return <article key={request.id} className="admin-request-item-next"><span className={`admin-request-dot-next ${status.tone}`} /><div><strong>{request.planVersion.plan.displayName}</strong><span>{request.code}{request.createdAt ? ` · ${new Date(request.createdAt).toLocaleDateString('es-PE')}` : ''}</span><small>{request.rejectionReason || status.detail}</small></div><div><b>S/{request.offeredPrice}</b><span className={`admin-status-badge ${status.tone}`}>{status.label}</span></div></article>;
      })}</div> : <div className="admin-history-empty-next"><span>◎</span><div><strong>Aún no tienes solicitudes</strong><p>Cuando reportes un pago podrás seguir su validación desde aquí.</p></div></div>}
    </section>
  </article>;
}
