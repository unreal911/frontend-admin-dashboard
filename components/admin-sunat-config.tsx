'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminUi } from '@/components/admin-ui-provider';
import { AdminSelect } from '@/components/admin-select';

type SunatEnvironment = 'BETA' | 'PRODUCCION';

interface EmisorConfigView {
  configured: boolean;
  encryptionConfigured: boolean;
  environment: SunatEnvironment;
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  ubigeo: string;
  direccion: string | null;
  tipoOperacion: string | null;
  regimen: string | null;
  solUser: string;
  signatureId: string;
  hasSolPassword: boolean;
  hasCertificate: boolean;
  certSubjectCN: string | null;
  certNotAfter: string | null;
  certExpired: boolean;
  updatedById: number | null;
  updatedAt: string;
}

interface ProbarResultado {
  ok: boolean;
  environment: SunatEnvironment;
  message: string;
  code?: string;
}

interface FormState {
  environment: SunatEnvironment;
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  ubigeo: string;
  direccion: string;
  tipoOperacion: string;
  regimen: string;
  solUser: string;
  signatureId: string;
  solPassword: string; // write-only, vacio = no cambia
}

function formFromView(view: EmisorConfigView): FormState {
  return {
    environment: view.environment,
    ruc: view.ruc,
    razonSocial: view.razonSocial,
    nombreComercial: view.nombreComercial ?? '',
    ubigeo: view.ubigeo,
    direccion: view.direccion ?? '',
    tipoOperacion: view.tipoOperacion ?? '',
    regimen: view.regimen ?? '',
    solUser: view.solUser,
    signatureId: view.signatureId,
    solPassword: '',
  };
}

function formatFechaHora(iso: string | null): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

export function AdminSunatConfig() {
  const { showAlert, confirm } = useAdminUi();
  const [view, setView] = useState<EmisorConfigView | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [probando, setProbando] = useState(false);
  const [probarResult, setProbarResult] = useState<ProbarResultado | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [certAdminPassword, setCertAdminPassword] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/sunat/config', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown } | null)?.error || 'No se pudo cargar la configuracion.'), 'error');
        return;
      }
      const v = payload as EmisorConfigView;
      setView(v);
      setForm(formFromView(v));
    } catch {
      showAlert('No se pudo cargar la configuracion SUNAT.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function guardar() {
    if (!form) return;

    if (form.ruc && !/^\d{11}$/.test(form.ruc.trim())) {
      showAlert('El RUC debe tener 11 digitos.', 'error');
      return;
    }
    if (form.ubigeo && !/^\d{6}$/.test(form.ubigeo.trim())) {
      showAlert('El ubigeo debe tener 6 digitos.', 'error');
      return;
    }

    // Cambios sensibles (entorno o Clave SOL) exigen re-autenticacion (step-up).
    const cambioSensible = form.environment !== view?.environment || Boolean(form.solPassword.trim());
    if (cambioSensible && !adminPassword.trim()) {
      showAlert('Confirma tu contraseña de administrador para cambiar credenciales o entorno.', 'error');
      return;
    }

    // Aviso reforzado al pasar a PRODUCCION: emite documentos con validez tributaria real.
    const pasaAProduccion = form.environment === 'PRODUCCION' && view?.environment !== 'PRODUCCION';
    if (pasaAProduccion) {
      const ok = await confirm({
        title: 'Activar PRODUCCION',
        message:
          'Vas a emitir comprobantes con validez tributaria real ante SUNAT. Verifica RUC, credenciales y certificado. Esta accion deja de usar el entorno de pruebas (BETA).',
        acceptText: 'Activar produccion',
        cancelText: 'Cancelar',
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        environment: form.environment,
        ruc: form.ruc.trim(),
        razonSocial: form.razonSocial.trim(),
        nombreComercial: form.nombreComercial.trim() || null,
        ubigeo: form.ubigeo.trim(),
        direccion: form.direccion.trim() || null,
        tipoOperacion: form.tipoOperacion.trim() || null,
        regimen: form.regimen.trim() || null,
        solUser: form.solUser.trim(),
        signatureId: form.signatureId.trim() || 'SignSUNAT',
      };
      // Clave SOL write-only: solo se envia si el admin escribio algo.
      if (form.solPassword.trim()) body.solPassword = form.solPassword;
      if (cambioSensible) body.adminPassword = adminPassword;

      const response = await fetch('/api/admin/sunat/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown } | null)?.error || 'No se pudo guardar la configuracion.'), 'error');
        return;
      }
      const v = payload as EmisorConfigView;
      setView(v);
      setForm(formFromView(v));
      setAdminPassword('');
      showAlert('Configuracion guardada.', 'success');
    } catch {
      showAlert('No se pudo guardar la configuracion.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function subirCertificado() {
    if (!certFile) {
      showAlert('Selecciona el archivo .pfx / .p12 del certificado.', 'error');
      return;
    }
    if (!certAdminPassword.trim()) {
      showAlert('Confirma tu contraseña de administrador para cargar el certificado.', 'error');
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToBase64(certFile);
      const response = await fetch('/api/admin/sunat/config/certificado', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ p12Base64: dataUrl, password: certPassword, adminPassword: certAdminPassword }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown } | null)?.error || 'No se pudo cargar el certificado.'), 'error');
        return;
      }
      const v = payload as EmisorConfigView;
      setView(v);
      setForm(formFromView(v));
      setCertFile(null);
      setCertPassword('');
      setCertAdminPassword('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      showAlert(`Certificado cargado${v.certSubjectCN ? ` (${v.certSubjectCN})` : ''}.`, 'success');
    } catch {
      showAlert('No se pudo cargar el certificado.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function probarConexion() {
    setProbando(true);
    setProbarResult(null);
    try {
      const response = await fetch('/api/admin/sunat/config/probar', { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as ProbarResultado | null;
      if (!payload) {
        showAlert('No se pudo probar la conexion.', 'error');
        return;
      }
      setProbarResult(payload);
      showAlert(payload.message, payload.ok ? 'success' : 'error', 5000);
    } catch {
      showAlert('No se pudo probar la conexion.', 'error');
    } finally {
      setProbando(false);
    }
  }

  const envBadgeCls = view?.environment === 'PRODUCCION' ? 'error' : 'info';

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card inventory-header-card">
        <div>
          <p className="section-kicker">Facturacion electronica</p>
          <h1 className="section-title">Emisor SUNAT</h1>
          <p className="section-subtitle">
            Datos del emisor, credenciales Clave SOL y certificado digital para la emision de comprobantes.
          </p>
        </div>
        <div className="inventory-header-actions">
          <button type="button" className="admin-ghost-btn" onClick={cargar} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </article>

      {/* Estado actual */}
      <article className="admin-card">
        <div className="admin-status-row-next" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <span className={`admin-status-badge ${envBadgeCls}`}>
            {view?.environment === 'PRODUCCION' ? 'PRODUCCION' : 'BETA (pruebas)'}
          </span>
          <span className={`admin-status-badge ${view?.configured ? 'success' : 'warning'}`}>
            {view?.configured ? 'Listo para emitir' : 'Sin configurar'}
          </span>
          {view && !view.encryptionConfigured ? (
            <span className="admin-status-badge error">Falta SUNAT_CONFIG_ENC_KEY</span>
          ) : null}
          <div style={{ marginLeft: 'auto' }}>
            <button type="button" className="admin-ghost-btn" onClick={probarConexion} disabled={probando || loading}>
              {probando ? 'Probando...' : 'Probar conexion'}
            </button>
          </div>
        </div>
        {view && !view.encryptionConfigured ? (
          <p className="admin-field-hint" style={{ marginTop: 8 }}>
            Define la variable de entorno <code>SUNAT_CONFIG_ENC_KEY</code> en el backend para poder guardar la Clave SOL y el certificado cifrados.
          </p>
        ) : null}
        {probarResult ? (
          <p className={`admin-status-badge ${probarResult.ok ? 'success' : 'error'}`} style={{ marginTop: 12 }}>
            {probarResult.message}
          </p>
        ) : null}
        <p className="admin-field-hint" style={{ marginTop: 12 }}>
          Ultima modificacion: {formatFechaHora(view?.updatedAt ?? null)}
          {view?.updatedById ? ` · usuario #${view.updatedById}` : ''}
        </p>
      </article>

      {loading || !form ? (
        <article className="admin-card">
          <p className="admin-muted-text">Cargando configuracion...</p>
        </article>
      ) : (
        <>
          {/* Datos del emisor */}
          <article className="admin-card">
            <div>
              <h2 className="section-title" style={{ fontSize: '1.05rem' }}>Datos del emisor</h2>
              <p className="section-subtitle">Identidad tributaria que se imprime en los comprobantes.</p>
            </div>
            <div className="company-settings-grid">
              <label className="admin-form-field">
                <span>RUC</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.ruc}
                  placeholder="20601234567"
                  disabled={saving}
                  onChange={(e) => updateField('ruc', e.target.value)}
                />
              </label>
              <label className="admin-form-field">
                <span>Razon social</span>
                <input
                  type="text"
                  value={form.razonSocial}
                  placeholder="EMPRESA DEMO SAC"
                  disabled={saving}
                  onChange={(e) => updateField('razonSocial', e.target.value)}
                />
              </label>
              <label className="admin-form-field">
                <span>Nombre comercial</span>
                <input
                  type="text"
                  value={form.nombreComercial}
                  placeholder="Opcional"
                  disabled={saving}
                  onChange={(e) => updateField('nombreComercial', e.target.value)}
                />
              </label>
              <label className="admin-form-field">
                <span>Ubigeo</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.ubigeo}
                  placeholder="150101"
                  disabled={saving}
                  onChange={(e) => updateField('ubigeo', e.target.value)}
                />
              </label>
              <label className="admin-form-field">
                <span>Tipo de operacion</span>
                <input
                  type="text"
                  value={form.tipoOperacion}
                  placeholder="Opcional"
                  disabled={saving}
                  onChange={(e) => updateField('tipoOperacion', e.target.value)}
                />
              </label>
              <label className="admin-form-field">
                <span>Regimen tributario</span>
                <input
                  type="text"
                  value={form.regimen}
                  placeholder="Opcional"
                  disabled={saving}
                  onChange={(e) => updateField('regimen', e.target.value)}
                />
              </label>
              <label className="admin-form-field company-address-field">
                <span>Direccion del domicilio fiscal</span>
                <textarea
                  value={form.direccion}
                  placeholder="Direccion fiscal del emisor"
                  disabled={saving}
                  onChange={(e) => updateField('direccion', e.target.value)}
                />
              </label>
              <label className="admin-form-field">
                <span>Signature ID</span>
                <input
                  type="text"
                  value={form.signatureId}
                  placeholder="SignSUNAT"
                  disabled={saving}
                  onChange={(e) => updateField('signatureId', e.target.value)}
                />
              </label>
            </div>
          </article>

          {/* Seccion sensible: credenciales + entorno */}
          <article className="admin-card admin-sunat-sensitive-card" style={{ borderColor: 'var(--admin-danger, #dc2626)' }}>
            <div>
              <h2 className="section-title" style={{ fontSize: '1.05rem' }}>Credenciales y entorno</h2>
              <p className="section-subtitle">
                Datos sensibles. La Clave SOL se guarda cifrada y nunca se muestra. Dejala en blanco para no cambiarla.
              </p>
            </div>
            <div className="company-settings-grid">
              <label className="admin-form-field">
                <span>Usuario SOL (secundario)</span>
                <input
                  type="text"
                  value={form.solUser}
                  placeholder="MODDATOS"
                  autoComplete="off"
                  disabled={saving}
                  onChange={(e) => updateField('solUser', e.target.value)}
                />
              </label>
              <label className="admin-form-field">
                <span>Clave SOL</span>
                <input
                  type="password"
                  value={form.solPassword}
                  placeholder={view?.hasSolPassword ? '•••••••• (configurada)' : 'Sin configurar'}
                  autoComplete="new-password"
                  disabled={saving || (view ? !view.encryptionConfigured : false)}
                  onChange={(e) => updateField('solPassword', e.target.value)}
                />
                <small className="admin-field-hint">Se envia solo si escribes un valor nuevo.</small>
              </label>
              <label className="admin-form-field">
                <span>Entorno</span>
                <AdminSelect
                  value={form.environment}
                  disabled={saving}
                  ariaLabel="Entorno"
                  onChange={(value) => updateField('environment', value as SunatEnvironment)}
                  options={[
                    { value: 'BETA', label: 'BETA (pruebas)' },
                    { value: 'PRODUCCION', label: 'PRODUCCION' },
                  ]}
                />
                <small className="admin-field-hint">Produccion exige RUC valido y certificado real cargado.</small>
              </label>
              <label className="admin-form-field">
                <span>Confirma tu contraseña de administrador</span>
                <input
                  type="password"
                  value={adminPassword}
                  placeholder="Requerida para cambiar clave o entorno"
                  autoComplete="off"
                  disabled={saving}
                  onChange={(e) => setAdminPassword(e.target.value)}
                />
                <small className="admin-field-hint">Solo se pide al cambiar la Clave SOL o el entorno.</small>
              </label>
            </div>
            <div className="admin-table-actions" style={{ marginTop: 16 }}>
              <button type="button" className="admin-primary-btn" onClick={guardar} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar configuracion'}
              </button>
            </div>
          </article>

          {/* Certificado digital */}
          <article className="admin-card">
            <div>
              <h2 className="section-title" style={{ fontSize: '1.05rem' }}>Certificado digital</h2>
              <p className="section-subtitle">
                Archivo .pfx / .p12 emitido por una entidad autorizada. Se valida, cifra y guarda; nunca se descarga, solo se reemplaza.
              </p>
            </div>

            {view?.hasCertificate ? (
              <div className="dashboard-kpi-grid-next" style={{ marginBottom: 12 }}>
                <article className="dashboard-kpi-card-next">
                  <p>Titular (CN)</p>
                  <strong style={{ fontSize: '0.95rem' }}>{view.certSubjectCN || '-'}</strong>
                  <span>certificado cargado</span>
                </article>
                <article className="dashboard-kpi-card-next">
                  <p>Vence</p>
                  <strong style={{ fontSize: '0.95rem' }}>{formatFechaHora(view.certNotAfter)}</strong>
                  <span>
                    {view.certExpired ? (
                      <span className="admin-status-badge error">Vencido</span>
                    ) : (
                      <span className="admin-status-badge success">Vigente</span>
                    )}
                  </span>
                </article>
              </div>
            ) : (
              <p className="admin-muted-text" style={{ marginBottom: 12 }}>
                No hay certificado cargado. En BETA se usa uno autofirmado; produccion exige el certificado real.
              </p>
            )}

            <div className="company-settings-grid">
              <label className="admin-form-field">
                <span>Archivo .pfx / .p12</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pfx,.p12,application/x-pkcs12"
                  disabled={uploading || (view ? !view.encryptionConfigured : false)}
                  onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="admin-form-field">
                <span>Contraseña del certificado</span>
                <input
                  type="password"
                  value={certPassword}
                  placeholder="La que entrego la entidad emisora"
                  autoComplete="new-password"
                  disabled={uploading || (view ? !view.encryptionConfigured : false)}
                  onChange={(e) => setCertPassword(e.target.value)}
                />
              </label>
              <label className="admin-form-field">
                <span>Confirma tu contraseña de administrador</span>
                <input
                  type="password"
                  value={certAdminPassword}
                  placeholder="Requerida para cargar el certificado"
                  autoComplete="off"
                  disabled={uploading || (view ? !view.encryptionConfigured : false)}
                  onChange={(e) => setCertAdminPassword(e.target.value)}
                />
              </label>
            </div>
            <div className="admin-table-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="admin-primary-btn"
                onClick={subirCertificado}
                disabled={uploading || !certFile || (view ? !view.encryptionConfigured : false)}
              >
                {uploading ? 'Subiendo...' : view?.hasCertificate ? 'Reemplazar certificado' : 'Subir certificado'}
              </button>
            </div>
          </article>
        </>
      )}
    </section>
  );
}
