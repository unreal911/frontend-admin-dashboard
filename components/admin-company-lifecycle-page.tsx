'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAdminUi } from '@/components/admin-ui-provider';
import { AdminSubscriptionPanel } from '@/components/admin-subscription-panel';
import { useAdminAuth } from '@/components/admin-auth-provider';

type Lifecycle = {
  tenant: {
    name: string;
    status: string;
    kind: string;
    planCode: string;
    ruc?: string | null;
    legalName?: string | null;
    address?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    rucConfirmedAt?: string | null;
    trialEndsAt?: string | null;
    graceEndsAt?: string | null;
    productionApprovedAt?: string | null;
    sunatProductionEnabled: boolean;
    maxUsers: number;
    maxProducts: number;
    maxOrders: number;
    maxStores: number;
    maxVariantsPerProduct: number;
    maxPosSalesPerMonth: number;
    maxMainImagesPerProduct: number;
    maxImagesPerVariant: number;
    maxStorageBytes: string;
  };
  plan: {
    code: string;
    name: string;
    monthlyPricePen: number | null;
    features: string[];
    effectiveMaxStores: number;
    welcomeStorePromotion: {
      active: boolean;
      endsAt?: string | null;
      primaryStoreId?: number | null;
      warning: boolean;
    };
  };
  usage: {
    users: number;
    products: number;
    stores: number;
    activeVariants: number;
    posSales: number;
    posSalesToday: number;
    posSalesPeriodEnd: string;
    posSalesGraceUntil?: string | null;
    storageBytes: string;
  };
  conflicts: {
    hasConflicts: boolean;
    users: { used: number; limit: number; excess: number };
    products: { used: number; limit: number; excess: number };
    stores: { used: number; limit: number; excess: number };
    productsOverVariantLimit: number;
    productsOverMainImageLimit: number;
    variantsWithImagesNotAllowed: number;
  };
  readOnly: boolean;
};

type StoreOption = { id: number; name: string; code: string; isActive: boolean };

function percent(used: number, limit: number): number {
  return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
}

export function AdminCompanyLifecyclePage() {
  const { showAlert } = useAdminUi();
  const { user } = useAdminAuth();
  const [data, setData] = useState<Lifecycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [primaryStoreId, setPrimaryStoreId] = useState('');
  const [savingPrimaryStore, setSavingPrimaryStore] = useState(false);
  const [form, setForm] = useState({ ruc: '', legalName: '', address: '', contactEmail: '', contactPhone: '', confirmRuc: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/tenant/lifecycle', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.message || 'No se pudo cargar la empresa.'));
      const next = payload as Lifecycle;
      const rawTenant = (payload as { tenant: Partial<Lifecycle['tenant']> }).tenant;
      const nextTenant = {
        maxUsers: 0, maxProducts: 0, maxOrders: 0, maxStores: 0, maxVariantsPerProduct: 0,
        maxPosSalesPerMonth: 0, maxMainImagesPerProduct: 0, maxImagesPerVariant: 0,
        maxStorageBytes: '0', sunatProductionEnabled: false,
        ...rawTenant,
      } as Lifecycle['tenant'];
      const nextPlan = next.plan ?? {
        code: nextTenant.planCode,
        name: nextTenant.planCode === 'TRIAL' ? 'Prueba gratuita' : nextTenant.planCode,
        monthlyPricePen: null,
        features: [],
        effectiveMaxStores: nextTenant.maxStores,
        welcomeStorePromotion: { active: false, warning: false },
      };
      const rawUsage = (payload as { usage?: Partial<Lifecycle['usage']> }).usage;
      const nextUsage = {
        users: 0, products: 0, stores: 0, activeVariants: 0, posSales: 0, posSalesToday: 0,
        posSalesPeriodEnd: new Date().toISOString(), storageBytes: '0',
        ...(rawUsage ?? {}),
      } as Lifecycle['usage'];
      const rawConflicts = (payload as { conflicts?: Partial<Lifecycle['conflicts']> }).conflicts;
      const nextConflicts = {
        hasConflicts: false,
        users: { used: nextUsage.users, limit: nextTenant.maxUsers, excess: 0 },
        products: { used: nextUsage.products, limit: nextTenant.maxProducts, excess: 0 },
        stores: { used: nextUsage.stores, limit: nextPlan.effectiveMaxStores, excess: 0 },
        productsOverVariantLimit: 0, productsOverMainImageLimit: 0, variantsWithImagesNotAllowed: 0,
        ...(rawConflicts ?? {}),
      } as Lifecycle['conflicts'];
      setData({ ...next, tenant: nextTenant, plan: nextPlan, usage: nextUsage, conflicts: nextConflicts });
      setTrialDaysRemaining(nextTenant.planCode === 'TRIAL' && nextTenant.trialEndsAt
        ? Math.max(0, Math.ceil((new Date(nextTenant.trialEndsAt).getTime() - Date.now()) / 86_400_000))
        : null);
      setPrimaryStoreId(nextPlan.welcomeStorePromotion.primaryStoreId
        ? String(nextPlan.welcomeStorePromotion.primaryStoreId)
        : '');
      setForm({
        ruc: nextTenant.ruc || '',
        legalName: nextTenant.legalName || '',
        address: nextTenant.address || '',
        contactEmail: nextTenant.contactEmail || '',
        contactPhone: nextTenant.contactPhone || '',
        confirmRuc: Boolean(nextTenant.rucConfirmedAt),
      });
      if (nextTenant.planCode === 'STARTER' && nextPlan.welcomeStorePromotion.endsAt) {
        const storesResponse = await fetch('/api/admin/stores?includeInactive=false&take=100', { cache: 'no-store' });
        if (storesResponse.ok) {
          const storePayload = await storesResponse.json().catch(() => []);
          setStores(Array.isArray(storePayload) ? storePayload : []);
        }
      }
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'No se pudo cargar la empresa.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/admin/tenant/legal-profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.message || 'No se pudo guardar el perfil legal.'));
      showAlert('Perfil legal guardado y auditado.', 'success');
      await load();
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'No se pudo guardar el perfil legal.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const response = await fetch('/api/admin/tenant/export', { cache: 'no-store' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(String(payload?.message || 'No se pudo exportar la empresa.'));
      }
      const blob = await response.blob();
      const disposition = String(response.headers.get('content-disposition') || '');
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || 'tienda-export.json';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      const checksum = String(response.headers.get('x-export-sha256') || '');
      showAlert(checksum ? `Exportación lista. SHA-256: ${checksum}` : 'Exportación lista.', 'success');
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'No se pudo exportar la empresa.', 'error');
    } finally {
      setExporting(false);
    }
  }

  async function savePrimaryStore() {
    const storeId = Number(primaryStoreId);
    if (!Number.isInteger(storeId) || storeId < 1) return;
    setSavingPrimaryStore(true);
    try {
      const response = await fetch('/api/admin/tenant/primary-store', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storeId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.message || 'No se pudo elegir la tienda principal.'));
      showAlert('Tienda principal guardada.', 'success');
      await load();
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'No se pudo elegir la tienda principal.', 'error');
    } finally {
      setSavingPrimaryStore(false);
    }
  }

  if (loading) return <section className="admin-page-stack admin-company-page-next"><article className="admin-card admin-company-loading-next"><span /><span /><span /></article></section>;
  if (!data) return <section className="admin-page-stack"><article className="admin-card">Empresa no disponible.</article></section>;
  const quotas = [
    { label: 'Usuarios', used: data.usage.users, limit: data.tenant.maxUsers },
    { label: 'Productos activos', used: data.usage.products, limit: data.tenant.maxProducts },
    { label: 'Tiendas activas', used: data.usage.stores, limit: data.plan.effectiveMaxStores },
    { label: 'Ventas POS del periodo', used: data.usage.posSales, limit: data.tenant.maxPosSalesPerMonth },
  ];
  return (
    <section className="admin-page-stack admin-company-page-next">
      <article className="admin-card admin-company-summary-card-next">
        <div className="admin-company-hero-copy-next">
          <div className="admin-company-title-block-next admin-page-header"><span className="admin-company-eyebrow-next">Cuenta empresarial</span><h1>{data.tenant.name}</h1></div>
          <p>Administra tu suscripción, capacidad operativa y datos fiscales desde un solo lugar.</p>
          <nav className="admin-company-nav-next" aria-label="Secciones de empresa">
            <a href="#planes-y-pago">Planes y pagos</a><a href="#uso-del-plan">Uso del plan</a><a href="#perfil-legal">Perfil legal</a>
          </nav>
        </div>
        <div className="admin-current-plan-next">
          <div><span>Plan actual</span><span className={`admin-status-badge ${data.readOnly ? 'warning' : 'success'}`}>{data.readOnly ? 'Solo lectura' : 'Cuenta operativa'}</span></div>
          <strong>{data.plan.name}</strong>
          <p>{data.plan.monthlyPricePen === null ? 'Periodo de prueba' : `S/${data.plan.monthlyPricePen.toLocaleString('es-PE', { minimumFractionDigits: 2 })} al mes`}</p>
          <div className="admin-current-plan-meta-next"><span><b>{data.tenant.maxProducts}</b> productos</span><span><b>{data.tenant.maxUsers}</b> usuarios</span><span><b>{data.plan.effectiveMaxStores}</b> tiendas</span></div>
        </div>
      </article>

      {data.tenant.planCode === 'TRIAL' && data.tenant.trialEndsAt ? (
        <article className={`admin-card admin-company-trial-card-next ${trialDaysRemaining !== null && trialDaysRemaining <= 5 ? 'urgent' : ''}`}>
          <div className="admin-trial-countdown-next"><strong>{trialDaysRemaining ?? '—'}</strong><span>{trialDaysRemaining === 1 ? 'día restante' : 'días restantes'}</span></div>
          <div className="admin-trial-copy-next"><span className="admin-company-eyebrow-next">Periodo de prueba</span><h2>{trialDaysRemaining === 0 ? 'Tu prueba terminó' : 'Aprovecha tu prueba sin interrupciones'}</h2><p>Tu acceso trial vence el <strong>{new Date(data.tenant.trialEndsAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>. Elige un plan y reporta el pago antes de esa fecha.</p><small>SUNAT se habilita al activar un plan pagado.</small></div>
          <div className="admin-trial-actions-next"><a className="admin-primary-btn" href="#planes-y-pago">Elegir mi plan</a>{user?.membership.role === 'OWNER' ? <button className="admin-ghost-btn" type="button" disabled={exporting} onClick={() => void exportData()}>{exporting ? 'Preparando…' : 'Exportar datos'}</button> : null}</div>
        </article>
      ) : null}

      {data.plan.welcomeStorePromotion.endsAt ? (
        <article className="admin-card admin-company-promotion-card-next">
          <div><span className="admin-company-eyebrow-next">Beneficio temporal</span><h2>Segunda tienda incluida</h2></div>
          <p>
            {data.plan.welcomeStorePromotion.active ? 'Disponible' : 'Finalizado'} · vence:{' '}
            {new Date(data.plan.welcomeStorePromotion.endsAt).toLocaleString('es-PE')}
          </p>
          {data.plan.welcomeStorePromotion.warning ? <p><strong>Elige la tienda que seguirá operativa antes del vencimiento.</strong></p> : null}
          {stores.length > 0 ? (
            <div className="tenant-invitation-form-next">
              <label>
                <span>Tienda principal</span>
                <select value={primaryStoreId} onChange={(event) => setPrimaryStoreId(event.target.value)}>
                  <option value="">Selecciona una tienda</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.name} ({store.code})</option>)}
                </select>
              </label>
              <button className="admin-primary-btn" type="button" disabled={!primaryStoreId || savingPrimaryStore} onClick={() => void savePrimaryStore()}>
                {savingPrimaryStore ? 'Guardando...' : 'Guardar tienda principal'}
              </button>
            </div>
          ) : null}
        </article>
      ) : null}

      <AdminSubscriptionPanel currentPlanCode={data.tenant.planCode} />

      <article className="admin-card admin-company-usage-card-next" id="uso-del-plan">
        <div className="admin-company-section-head-next"><div><span className="admin-company-eyebrow-next">Capacidad</span><h2>Uso del plan</h2><p>Revisa cuánto espacio operativo tienes disponible antes de alcanzar un límite.</p></div><span className="admin-storage-chip-next">{(Number(data.tenant.maxStorageBytes) / 1073741824).toLocaleString('es-PE')} GB contratados</span></div>
        {data.usage.posSalesGraceUntil ? <p><strong>Cuota POS alcanzada:</strong> puedes continuar hasta {new Date(data.usage.posSalesGraceUntil).toLocaleString('es-PE')}.</p> : null}
        {data.conflicts?.hasConflicts ? (
          <div className="admin-inline-alert warning">
            <strong>Tu información se conserva, pero debes resolver estos excesos antes de crear más recursos:</strong>
            <ul>
              {data.conflicts.users.excess > 0 ? <li>{data.conflicts.users.excess} usuario(s) sobre la cuota.</li> : null}
              {data.conflicts.products.excess > 0 ? <li>{data.conflicts.products.excess} producto(s) activo(s) sobre la cuota.</li> : null}
              {data.conflicts.stores.excess > 0 ? <li>{data.conflicts.stores.excess} tienda(s) activa(s) sobre la cuota.</li> : null}
              {data.conflicts.productsOverVariantLimit > 0 ? <li>{data.conflicts.productsOverVariantLimit} producto(s) exceden el máximo de variantes.</li> : null}
              {data.conflicts.productsOverMainImageLimit > 0 ? <li>{data.conflicts.productsOverMainImageLimit} producto(s) exceden el máximo de imágenes principales.</li> : null}
              {data.conflicts.variantsWithImagesNotAllowed > 0 ? <li>{data.conflicts.variantsWithImagesNotAllowed} variante(s) conservan imágenes no permitidas para nuevas cargas.</li> : null}
            </ul>
          </div>
        ) : null}
        <div className="admin-company-usage-grid-next">
          {quotas.map((quota, index) => (
            <div key={quota.label} className="admin-company-quota-next">
              <div><span className="admin-quota-icon-next">{['U', 'P', 'T', 'V'][index]}</span><span className={`admin-quota-percent-next ${percent(quota.used, quota.limit) >= 85 ? 'warning' : ''}`}>{percent(quota.used, quota.limit)}%</span></div>
              <strong>{quota.label}</strong><p><b>{quota.used.toLocaleString('es-PE')}</b> de {quota.limit.toLocaleString('es-PE')}</p><progress max={100} value={percent(quota.used, quota.limit)} />
            </div>
          ))}
        </div>
        <div className="admin-plan-details-next"><span>Hasta <b>{data.tenant.maxVariantsPerProduct}</b> variantes por producto</span><span><b>{data.tenant.maxMainImagesPerProduct}</b> imágenes principales</span><span><b>{data.tenant.maxImagesPerVariant}</b> imágenes por variante</span><span><b>{(Number(data.usage.storageBytes) / 1048576).toLocaleString('es-PE', { maximumFractionDigits: 2 })} MB</b> en archivos protegidos</span></div>
      </article>

      <article className="admin-card admin-company-legal-card-next" id="perfil-legal">
        <div className="admin-company-section-head-next"><div><span className="admin-company-eyebrow-next">Datos de empresa</span><h2>Perfil legal</h2><p>Esta información se utiliza en documentos, comunicaciones y configuración tributaria.</p></div>{data.tenant.rucConfirmedAt ? <span className="admin-status-badge success">RUC confirmado</span> : <span className="admin-status-badge warning">Pendiente de confirmar</span>}</div>
        <form className="tenant-invitation-form-next tenant-legal-profile-form-next" onSubmit={save}>
          <label><span>RUC</span><input value={form.ruc} inputMode="numeric" maxLength={11} onChange={(e) => setForm({ ...form, ruc: e.target.value.replace(/\D/g, '') })} required /></label>
          <label><span>Razón social</span><input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} required /></label>
          <label><span>Dirección fiscal</span><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required /></label>
          <label><span>Correo de contacto</span><input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></label>
          <label><span>Teléfono</span><input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></label>
          <label className="tenant-legal-confirm-next">
            <input type="checkbox" checked={form.confirmRuc} disabled={Boolean(data.tenant.rucConfirmedAt)} onChange={(e) => setForm({ ...form, confirmRuc: e.target.checked })} />
            <span>Confirmo que el RUC pertenece a esta empresa</span>
          </label>
          <button className="admin-primary-btn" type="submit" disabled={saving || data.readOnly}>{saving ? 'Guardando...' : 'Guardar perfil'}</button>
        </form>
      </article>
    </section>
  );
}
