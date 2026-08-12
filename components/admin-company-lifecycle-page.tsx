'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAdminUi } from '@/components/admin-ui-provider';
import { AdminSubscriptionPanel } from '@/components/admin-subscription-panel';

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
  const [data, setData] = useState<Lifecycle | null>(null);
  const [loading, setLoading] = useState(true);
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
      setData(next);
      setPrimaryStoreId(next.plan.welcomeStorePromotion.primaryStoreId
        ? String(next.plan.welcomeStorePromotion.primaryStoreId)
        : '');
      setForm({
        ruc: next.tenant.ruc || '',
        legalName: next.tenant.legalName || '',
        address: next.tenant.address || '',
        contactEmail: next.tenant.contactEmail || '',
        contactPhone: next.tenant.contactPhone || '',
        confirmRuc: Boolean(next.tenant.rucConfirmedAt),
      });
      if (next.tenant.planCode === 'STARTER' && next.plan.welcomeStorePromotion.endsAt) {
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

  if (loading) return <section className="admin-page-stack"><article className="admin-card">Cargando empresa...</article></section>;
  if (!data) return <section className="admin-page-stack"><article className="admin-card">Empresa no disponible.</article></section>;
  const quotas = [
    { label: 'Usuarios', used: data.usage.users, limit: data.tenant.maxUsers },
    { label: 'Productos activos', used: data.usage.products, limit: data.tenant.maxProducts },
    { label: 'Tiendas activas', used: data.usage.stores, limit: data.plan.effectiveMaxStores },
    { label: 'Ventas POS del periodo', used: data.usage.posSales, limit: data.tenant.maxPosSalesPerMonth },
  ];

  return (
    <section className="admin-page-stack admin-company-page-next">
      <article className="admin-card inventory-header-card admin-company-summary-card-next">
        <div>
          <p className="section-kicker">Empresa SaaS</p>
          <h1 className="section-title">{data.tenant.name}</h1>
          <p className="section-subtitle">Plan {data.plan.name} · Estado {data.tenant.status}</p>
        </div>
        <span className={`admin-status-badge ${data.readOnly ? 'warning' : 'success'}`}>
          {data.readOnly ? 'Solo lectura' : 'Operativa'}
        </span>
      </article>

      {data.tenant.trialEndsAt ? (
        <article className="admin-card admin-company-trial-card-next">
          <h2>Periodo de prueba</h2>
          <p>Vence: {new Date(data.tenant.trialEndsAt).toLocaleString('es-PE')}</p>
          {data.tenant.graceEndsAt ? <p>Consulta/exportación disponible hasta: {new Date(data.tenant.graceEndsAt).toLocaleString('es-PE')}</p> : null}
          <p>SUNAT: <strong>No disponible durante el trial</strong></p>
          <button className="admin-primary-btn" type="button" disabled={exporting} onClick={() => void exportData()}>
            {exporting ? 'Preparando exportación...' : 'Exportar mis datos'}
          </button>
        </article>
      ) : null}

      {data.plan.welcomeStorePromotion.endsAt ? (
        <article className="admin-card admin-company-trial-card-next">
          <h2>Beneficio de segunda tienda</h2>
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

      <article className="admin-card admin-company-usage-card-next">
        <h2>Uso del plan</h2>
        <p>Variantes activas por producto: máximo {data.tenant.maxVariantsPerProduct}. Imágenes principales: {data.tenant.maxMainImagesPerProduct}. Imágenes por variante: {data.tenant.maxImagesPerVariant}.</p>
        <p>
          Almacenamiento comercial contratado: {(Number(data.tenant.maxStorageBytes) / 1073741824).toLocaleString('es-PE')} GB.
          Los artefactos SUNAT protegidos ({(Number(data.usage.storageBytes) / 1048576).toLocaleString('es-PE', { maximumFractionDigits: 2 })} MB) no consumen esa cuota.
        </p>
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
          {quotas.map((quota) => (
            <div key={quota.label} className="admin-company-quota-next">
              <strong>{quota.label}</strong>
              <p>{quota.used.toLocaleString('es-PE')} / {quota.limit.toLocaleString('es-PE')}</p>
              <progress max={100} value={percent(quota.used, quota.limit)} style={{ width: '100%' }} />
            </div>
          ))}
        </div>
      </article>

      <article className="admin-card admin-company-legal-card-next">
        <h2>Perfil legal</h2>
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
