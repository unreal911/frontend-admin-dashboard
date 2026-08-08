'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAdminUi } from '@/components/admin-ui-provider';

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
    maxStorageBytes: string;
  };
  usage: { users: number; products: number; orders: number; storageBytes: string };
  readOnly: boolean;
};

function percent(used: number, limit: number): number {
  return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
}

export function AdminCompanyLifecyclePage() {
  const { showAlert } = useAdminUi();
  const [data, setData] = useState<Lifecycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState({ ruc: '', legalName: '', address: '', contactEmail: '', contactPhone: '', confirmRuc: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/tenant/lifecycle', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.message || 'No se pudo cargar la empresa.'));
      const next = payload as Lifecycle;
      setData(next);
      setForm({
        ruc: next.tenant.ruc || '',
        legalName: next.tenant.legalName || '',
        address: next.tenant.address || '',
        contactEmail: next.tenant.contactEmail || '',
        contactPhone: next.tenant.contactPhone || '',
        confirmRuc: Boolean(next.tenant.rucConfirmedAt),
      });
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

  if (loading) return <section className="admin-page-stack"><article className="admin-card">Cargando empresa...</article></section>;
  if (!data) return <section className="admin-page-stack"><article className="admin-card">Empresa no disponible.</article></section>;
  const storageUsed = Number(data.usage.storageBytes);
  const storageLimit = Number(data.tenant.maxStorageBytes);
  const quotas = [
    { label: 'Usuarios', used: data.usage.users, limit: data.tenant.maxUsers },
    { label: 'Productos', used: data.usage.products, limit: data.tenant.maxProducts },
    { label: 'Pedidos', used: data.usage.orders, limit: data.tenant.maxOrders },
    { label: 'Almacenamiento (MB)', used: Math.round(storageUsed / 1048576), limit: Math.round(storageLimit / 1048576) },
  ];

  return (
    <section className="admin-page-stack admin-company-page-next">
      <article className="admin-card inventory-header-card admin-company-summary-card-next">
        <div>
          <p className="section-kicker">Empresa SaaS</p>
          <h1 className="section-title">{data.tenant.name}</h1>
          <p className="section-subtitle">Plan {data.tenant.planCode} · Estado {data.tenant.status}</p>
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
          <p>SUNAT producción: <strong>{data.tenant.sunatProductionEnabled ? 'Habilitado' : 'Bloqueado'}</strong></p>
          <button className="admin-primary-btn" type="button" disabled={exporting} onClick={() => void exportData()}>
            {exporting ? 'Preparando exportación...' : 'Exportar mis datos'}
          </button>
        </article>
      ) : null}

      <article className="admin-card admin-company-usage-card-next">
        <h2>Uso del plan</h2>
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
