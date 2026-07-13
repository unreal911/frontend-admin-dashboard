'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAdminUi } from '@/components/admin-ui-provider';

interface OrderWorkflowSettings {
  returnResponsibilityManagementEnabled: boolean;
  pickingResponsibilityFlowEnabled: boolean;
  marketplacePaymentMethodsEnabled: boolean;
  marketplacePaymentMethodIds: number[];
  marketplaceIncludeIgv: boolean;
  marketplaceAutoReserveStock: boolean;
  companyName: string;
  companyLegalName: string;
  companyRuc: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyLogoUrl: string;
  marketplaceHeroHeading: string;
  posBoletaEnabled: boolean;
  posFacturaEnabled: boolean;
  brandDisplay: 'logo' | 'logo_text';
}

const MARKETPLACE_HERO_HEADING_MAX_LENGTH = 60;
const DEFAULT_MARKETPLACE_HERO_HEADING = 'Encuentra polos por color y talla';

interface PaymentMethod {
  id: number;
  name: string;
  code: string;
}

const DEFAULT_SETTINGS: OrderWorkflowSettings = {
  returnResponsibilityManagementEnabled: true,
  pickingResponsibilityFlowEnabled: false,
  marketplacePaymentMethodsEnabled: false,
  marketplacePaymentMethodIds: [],
  marketplaceIncludeIgv: true,
  marketplaceAutoReserveStock: false,
  companyName: 'B2B Marketplace',
  companyLegalName: '',
  companyRuc: '',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  companyLogoUrl: '',
  marketplaceHeroHeading: DEFAULT_MARKETPLACE_HERO_HEADING,
  posBoletaEnabled: false,
  posFacturaEnabled: false,
  brandDisplay: 'logo_text',
};

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function uniqueNumberIds(values: unknown): number[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

function normalizeSettings(payload: unknown): OrderWorkflowSettings {
  const data = (payload as { data?: Partial<OrderWorkflowSettings> } | null)?.data || {};
  return {
    returnResponsibilityManagementEnabled: data.returnResponsibilityManagementEnabled !== false,
    pickingResponsibilityFlowEnabled: data.pickingResponsibilityFlowEnabled === true,
    marketplacePaymentMethodsEnabled: data.marketplacePaymentMethodsEnabled === true,
    marketplacePaymentMethodIds: uniqueNumberIds(data.marketplacePaymentMethodIds),
    marketplaceIncludeIgv: data.marketplaceIncludeIgv !== false,
    marketplaceAutoReserveStock: data.marketplaceAutoReserveStock === true,
    companyName: normalizeText(data.companyName) || 'B2B Marketplace',
    companyLegalName: normalizeText(data.companyLegalName),
    companyRuc: normalizeText(data.companyRuc),
    companyAddress: normalizeText(data.companyAddress),
    companyPhone: normalizeText(data.companyPhone),
    companyEmail: normalizeText(data.companyEmail),
    companyLogoUrl: normalizeText(data.companyLogoUrl),
    marketplaceHeroHeading: normalizeText(data.marketplaceHeroHeading).slice(0, MARKETPLACE_HERO_HEADING_MAX_LENGTH) || DEFAULT_MARKETPLACE_HERO_HEADING,
    posBoletaEnabled: data.posBoletaEnabled === true,
    posFacturaEnabled: data.posFacturaEnabled === true,
    brandDisplay: data.brandDisplay === 'logo' ? 'logo' : 'logo_text',
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function normalizeActivePaymentMethods(payload: unknown): PaymentMethod[] {
  const data = (payload as { data?: PaymentMethod[] } | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }

  const normalized: PaymentMethod[] = [];
  for (const item of data) {
    const id = Number((item as PaymentMethod).id);
    const name = String((item as PaymentMethod).name || '').trim();
    if (!Number.isInteger(id) || id < 1 || !name) {
      continue;
    }
    normalized.push({
      id,
      name,
      code: String((item as PaymentMethod).code || '').trim(),
    });
  }
  return normalized;
}

function areNumberArraysEqual(first: number[], second: number[]): boolean {
  const firstNormalized = [...new Set(first.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
  const secondNormalized = [...new Set(second.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);

  if (firstNormalized.length !== secondNormalized.length) {
    return false;
  }

  for (let index = 0; index < firstNormalized.length; index += 1) {
    if (firstNormalized[index] !== secondNormalized[index]) {
      return false;
    }
  }

  return true;
}

function reconcileAllowedIds(ids: number[], activeMethodIds: Set<number>, fallbackIds: number[]): number[] {
  const normalized = uniqueNumberIds(ids).filter((id) => activeMethodIds.has(id));
  if (normalized.length > 0) {
    return normalized;
  }
  return [...fallbackIds];
}

interface SettingSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  onLabel?: string;
  offLabel?: string;
  ariaLabel: string;
}

function SettingSwitch({ checked, onChange, disabled = false, onLabel = 'Activo', offLabel = 'Inactivo', ariaLabel }: SettingSwitchProps) {
  return (
    <label className={`setting-switch${checked ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}>
      <span className="setting-switch-text">{checked ? onLabel : offLabel}</span>
      <span className="setting-switch-track" aria-hidden="true">
        <span className="setting-switch-thumb" />
      </span>
      <input
        type="checkbox"
        className="setting-switch-input"
        role="switch"
        aria-label={ariaLabel}
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function AdminSettingsPage() {
  const { showAlert } = useAdminUi();

  const [loading, setLoading] = useState(true);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [settings, setSettings] = useState<OrderWorkflowSettings>(DEFAULT_SETTINGS);
  const [initialSettings, setInitialSettings] = useState<OrderWorkflowSettings>(DEFAULT_SETTINGS);
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
  const [companyLogoPreview, setCompanyLogoPreview] = useState('');

  const hasChanges = useMemo(() => {
    return settings.returnResponsibilityManagementEnabled !== initialSettings.returnResponsibilityManagementEnabled
      || settings.pickingResponsibilityFlowEnabled !== initialSettings.pickingResponsibilityFlowEnabled
      || settings.marketplacePaymentMethodsEnabled !== initialSettings.marketplacePaymentMethodsEnabled
      || settings.marketplaceIncludeIgv !== initialSettings.marketplaceIncludeIgv
      || settings.marketplaceAutoReserveStock !== initialSettings.marketplaceAutoReserveStock
      || settings.companyName !== initialSettings.companyName
      || settings.companyLegalName !== initialSettings.companyLegalName
      || settings.companyRuc !== initialSettings.companyRuc
      || settings.companyAddress !== initialSettings.companyAddress
      || settings.companyPhone !== initialSettings.companyPhone
      || settings.companyEmail !== initialSettings.companyEmail
      || settings.companyLogoUrl !== initialSettings.companyLogoUrl
      || settings.marketplaceHeroHeading !== initialSettings.marketplaceHeroHeading
      || settings.posBoletaEnabled !== initialSettings.posBoletaEnabled
      || settings.posFacturaEnabled !== initialSettings.posFacturaEnabled
      || settings.brandDisplay !== initialSettings.brandDisplay
      || companyLogoFile !== null
      || !areNumberArraysEqual(settings.marketplacePaymentMethodIds, initialSettings.marketplacePaymentMethodIds);
  }, [settings, initialSettings, companyLogoFile]);

  async function loadSettings() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/system-config/order-workflow', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudo cargar la configuracion.'),
          'error',
        );
        return;
      }

      const normalized = normalizeSettings(payload);
      setSettings(normalized);
      setInitialSettings(normalized);
      setCompanyLogoFile(null);
      setCompanyLogoPreview(normalized.companyLogoUrl);
    } catch {
      showAlert('No se pudo cargar la configuracion.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadPaymentMethods() {
    setLoadingPaymentMethods(true);
    try {
      const response = await fetch('/api/admin/payment-methods/active', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setPaymentMethods([]);
        return;
      }

      const methods = normalizeActivePaymentMethods(payload);
      setPaymentMethods(methods);

      const activeMethodIds = new Set(methods.map((method) => method.id));
      const fallbackIds = methods.map((method) => method.id);
      setSettings((current) => ({
        ...current,
        marketplacePaymentMethodIds: reconcileAllowedIds(current.marketplacePaymentMethodIds, activeMethodIds, fallbackIds),
      }));
      setInitialSettings((current) => ({
        ...current,
        marketplacePaymentMethodIds: reconcileAllowedIds(current.marketplacePaymentMethodIds, activeMethodIds, fallbackIds),
      }));
    } finally {
      setLoadingPaymentMethods(false);
    }
  }

  useEffect(() => {
    loadSettings();
    loadPaymentMethods();
  }, []);

  function reload() {
    loadSettings();
    loadPaymentMethods();
  }

  function resetChanges() {
    setSettings({
      ...initialSettings,
      marketplacePaymentMethodIds: [...initialSettings.marketplacePaymentMethodIds],
    });
    setCompanyLogoFile(null);
    setCompanyLogoPreview(initialSettings.companyLogoUrl);
  }

  async function saveSettings() {
    if (!hasChanges || saving) {
      return;
    }

    if (settings.marketplacePaymentMethodsEnabled && settings.marketplacePaymentMethodIds.length === 0) {
      showAlert('Selecciona al menos un metodo de pago para activar esta regla.', 'error', 3500);
      return;
    }

    setSaving(true);
    try {
      const requestPayload: OrderWorkflowSettings & { companyLogoFile?: { filename: string; data: string } } = { ...settings };
      if (companyLogoFile) {
        requestPayload.companyLogoFile = {
          filename: companyLogoFile.name,
          data: await fileToBase64(companyLogoFile),
        };
      }

      const response = await fetch('/api/admin/system-config/order-workflow', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudo guardar la configuracion.'),
          'error',
          3500,
        );
        return;
      }

      const normalized = normalizeSettings(payload);
      const activeMethodIds = new Set(paymentMethods.map((method) => method.id));
      const fallbackIds = paymentMethods.map((method) => method.id);
      const reconciledIds = reconcileAllowedIds(normalized.marketplacePaymentMethodIds, activeMethodIds, fallbackIds);
      const reconciled = {
        ...normalized,
        marketplacePaymentMethodIds: reconciledIds,
      };

      setSettings(reconciled);
      setInitialSettings(reconciled);
      setCompanyLogoFile(null);
      setCompanyLogoPreview(reconciled.companyLogoUrl);
      showAlert('Configuracion guardada.', 'success');
    } catch {
      showAlert('No se pudo guardar la configuracion.', 'error', 3500);
    } finally {
      setSaving(false);
    }
  }

  function updateSetting<K extends keyof OrderWorkflowSettings>(key: K, value: OrderWorkflowSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function handleCompanyLogoFile(file: File | null) {
    setCompanyLogoFile(file);
    if (!file) {
      setCompanyLogoPreview(settings.companyLogoUrl);
      return;
    }
    setCompanyLogoPreview(URL.createObjectURL(file));
  }

  function updateCompanyLogoUrl(value: string) {
    updateSetting('companyLogoUrl', value);
    if (!companyLogoFile) {
      setCompanyLogoPreview(value.trim());
    }
  }

  function clearCompanyLogo() {
    updateSetting('companyLogoUrl', '');
    setCompanyLogoFile(null);
    setCompanyLogoPreview('');
  }

  function togglePaymentMethod(paymentMethodId: number, checked: boolean) {
    setSettings((current) => {
      const ids = new Set(current.marketplacePaymentMethodIds);
      if (checked) {
        ids.add(Number(paymentMethodId));
      } else {
        ids.delete(Number(paymentMethodId));
      }
      return {
        ...current,
        marketplacePaymentMethodIds: Array.from(ids.values()).filter((id) => Number.isInteger(id) && id > 0),
      };
    });
  }

  function isPaymentMethodSelected(paymentMethodId: number): boolean {
    return settings.marketplacePaymentMethodIds.includes(Number(paymentMethodId));
  }

  return (
    <section className="settings-page">
      <article className="admin-card settings-hero">
        <p className="section-kicker">Configuracion</p>
        <h1 className="section-title">Configuracion operativa</h1>
        <p className="section-subtitle">
          Ajusta la identidad de la empresa y las reglas del flujo de ventas, marketplace y punto de venta.
        </p>
      </article>

      <section className="settings-group">
        <header className="settings-group-head">
          <span className="settings-group-eyebrow">Identidad</span>
          <h2 className="settings-group-title">Empresa</h2>
        </header>

      <article className="settings-card company-settings-card">
        <div className="settings-card-head">
          <div>
            <h2>Datos de empresa</h2>
            <p>Estos datos se usaran como identidad del admin y base para boletas, notas de venta, pedidos y reportes.</p>
          </div>
          <span className="settings-pill">Fiscal y marca</span>
        </div>

        <div className="company-settings-layout">
          <div className="company-logo-panel">
            <div className="company-logo-preview">
              {companyLogoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={companyLogoPreview} alt={`Logo de ${settings.companyName || 'la empresa'}`} />
              ) : (
                <span>Logo</span>
              )}
            </div>
            <label className="company-logo-upload">
              <span>Subir logo</span>
              <input
                type="file"
                accept="image/*"
                disabled={loading || saving}
                onChange={(event) => handleCompanyLogoFile(event.target.files?.[0] || null)}
              />
            </label>
            <button type="button" className="admin-ghost-btn" onClick={clearCompanyLogo} disabled={loading || saving || (!settings.companyLogoUrl && !companyLogoFile)}>
              Quitar logo
            </button>

            <div className="brand-display-field">
              <span className="brand-display-label">Mostrar en la tienda</span>
              <div className="brand-display-options" role="group" aria-label="Como mostrar la marca">
                <button
                  type="button"
                  className={`brand-display-option${settings.brandDisplay === 'logo' ? ' active' : ''}`}
                  aria-pressed={settings.brandDisplay === 'logo'}
                  disabled={loading || saving}
                  onClick={() => updateSetting('brandDisplay', 'logo')}
                >
                  Solo logo
                </button>
                <button
                  type="button"
                  className={`brand-display-option${settings.brandDisplay === 'logo_text' ? ' active' : ''}`}
                  aria-pressed={settings.brandDisplay === 'logo_text'}
                  disabled={loading || saving}
                  onClick={() => updateSetting('brandDisplay', 'logo_text')}
                >
                  Logo + nombre
                </button>
              </div>
              <small className="admin-field-hint">
                Usa &quot;Solo logo&quot; si tu imagen ya incluye el nombre de la marca.
              </small>
            </div>
          </div>

          <div className="company-settings-grid">
            <label className="admin-form-field">
              <span>Nombre comercial</span>
              <input
                type="text"
                value={settings.companyName}
                placeholder="Nombre visible de la empresa"
                disabled={loading || saving}
                onChange={(event) => updateSetting('companyName', event.target.value)}
              />
            </label>
            <label className="admin-form-field">
              <span>Razon social</span>
              <input
                type="text"
                value={settings.companyLegalName}
                placeholder="Razon social o nombre legal"
                disabled={loading || saving}
                onChange={(event) => updateSetting('companyLegalName', event.target.value)}
              />
            </label>
            <label className="admin-form-field">
              <span>RUC / Documento fiscal</span>
              <input
                type="text"
                value={settings.companyRuc}
                placeholder="Ej. 20601234567"
                inputMode="numeric"
                disabled={loading || saving}
                onChange={(event) => updateSetting('companyRuc', event.target.value)}
              />
            </label>
            <label className="admin-form-field">
              <span>Telefono</span>
              <input
                type="text"
                value={settings.companyPhone}
                placeholder="Telefono de contacto"
                disabled={loading || saving}
                onChange={(event) => updateSetting('companyPhone', event.target.value)}
              />
            </label>
            <label className="admin-form-field">
              <span>Email</span>
              <input
                type="email"
                value={settings.companyEmail}
                placeholder="correo@empresa.com"
                disabled={loading || saving}
                onChange={(event) => updateSetting('companyEmail', event.target.value)}
              />
            </label>
            <label className="admin-form-field">
              <span>URL del logo</span>
              <input
                type="url"
                value={settings.companyLogoUrl}
                placeholder="https://..."
                disabled={loading || saving || companyLogoFile !== null}
                onChange={(event) => updateCompanyLogoUrl(event.target.value)}
              />
            </label>
            <label className="admin-form-field company-address-field">
              <span>Direccion fiscal / comercial</span>
              <textarea
                value={settings.companyAddress}
                placeholder="Direccion que aparecera en documentos y reportes"
                disabled={loading || saving}
                onChange={(event) => updateSetting('companyAddress', event.target.value)}
              />
            </label>
          </div>
        </div>
      </article>
      </section>

      <section className="settings-group">
        <header className="settings-group-head">
          <span className="settings-group-eyebrow">Tienda publica</span>
          <h2 className="settings-group-title">Marketplace mayorista</h2>
        </header>

      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h2>Titulo principal (hero)</h2>
            <p>Personaliza el titulo principal del catalogo mayorista. El nombre y logo de la marca se toman de &quot;Datos de empresa&quot;.</p>
          </div>
          <span className="settings-pill">Marca</span>
        </div>

        <label className="admin-form-field">
          <span>Titulo principal (hero)</span>
          <input
            type="text"
            value={settings.marketplaceHeroHeading}
            maxLength={MARKETPLACE_HERO_HEADING_MAX_LENGTH}
            placeholder={DEFAULT_MARKETPLACE_HERO_HEADING}
            disabled={loading || saving}
            onChange={(event) => updateSetting('marketplaceHeroHeading', event.target.value)}
          />
          <small className="admin-field-hint">
            {settings.marketplaceHeroHeading.length}/{MARKETPLACE_HERO_HEADING_MAX_LENGTH} caracteres. Manten el texto corto para que no rompa el diseno de la tienda.
          </small>
        </label>
      </article>

      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h2>Metodos de pago en marketplace</h2>
            <p>Define si el checkout del marketplace mostrara metodos de pago y cuales estaran disponibles para el cliente.</p>
          </div>
          <SettingSwitch
            ariaLabel="Metodos de pago en marketplace"
            checked={settings.marketplacePaymentMethodsEnabled}
            disabled={loading || loadingPaymentMethods || saving}
            onChange={(checked) => updateSetting('marketplacePaymentMethodsEnabled', checked)}
            onLabel="Activa"
            offLabel="Desactivada"
          />
        </div>

        {loadingPaymentMethods ? (
          <p className="settings-muted">Cargando metodos de pago activos...</p>
        ) : paymentMethods.length === 0 ? (
          <p className="settings-muted">No hay metodos de pago activos para configurar.</p>
        ) : (
          <div className="payment-method-grid">
            {paymentMethods.map((method) => (
              <label key={method.id} className="payment-method-option">
                <input
                  type="checkbox"
                  checked={isPaymentMethodSelected(method.id)}
                  disabled={loading || saving || !settings.marketplacePaymentMethodsEnabled}
                  onChange={(event) => togglePaymentMethod(method.id, event.target.checked)}
                />
                <span>{method.name}</span>
              </label>
            ))}
          </div>
        )}
      </article>

      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h2>IGV en ecommerce</h2>
            <p>Define si el checkout del marketplace debe incluir IGV (18%) en el total.</p>
          </div>
          <SettingSwitch
            ariaLabel="IGV en ecommerce"
            checked={settings.marketplaceIncludeIgv}
            disabled={loading || saving}
            onChange={(checked) => updateSetting('marketplaceIncludeIgv', checked)}
            onLabel="Incluido"
            offLabel="No incluido"
          />
        </div>
      </article>

      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h2>Reserva de stock en marketplace</h2>
            <p>Las compras del marketplace se registran como proformas. Las reservas se generan manualmente desde el detalle del pedido.</p>
          </div>
          <span className="settings-pill">Solo manual</span>
        </div>
      </article>
      </section>

      <section className="settings-group">
        <header className="settings-group-head">
          <span className="settings-group-eyebrow">Flujo de ordenes</span>
          <h2 className="settings-group-title">Responsabilidades</h2>
        </header>

      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h2>Responsabilidad de devolucion</h2>
            <p>Cuando esta activa, al cancelar un pedido con unidades separadas se asigna como responsable a quien cancela, con opcion de delegar o confirmar la devolucion.</p>
          </div>
          <SettingSwitch
            ariaLabel="Responsabilidad de devolucion"
            checked={settings.returnResponsibilityManagementEnabled}
            disabled={loading || saving}
            onChange={(checked) => updateSetting('returnResponsibilityManagementEnabled', checked)}
            onLabel="Activa"
            offLabel="Desactivada"
          />
        </div>
      </article>

      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h2>Responsabilidad en picking</h2>
            <p>Si esta activo, quien confirma la orden queda como responsable principal de picking y puede delegar.</p>
          </div>
          <SettingSwitch
            ariaLabel="Responsabilidad en picking"
            checked={settings.pickingResponsibilityFlowEnabled}
            disabled={loading || saving}
            onChange={(checked) => updateSetting('pickingResponsibilityFlowEnabled', checked)}
            onLabel="Activo"
            offLabel="Desactivado"
          />
        </div>
      </article>
      </section>

      <section className="settings-group">
        <header className="settings-group-head">
          <span className="settings-group-eyebrow">Punto de venta</span>
          <h2 className="settings-group-title">Comprobantes</h2>
        </header>

      <article className="settings-card">
        <div className="settings-card-head">
          <div>
            <h2>Comprobantes disponibles al cobrar</h2>
            <p>Elige que tipos de comprobante se podran seleccionar al cobrar en el Punto de Venta. La Nota de venta siempre esta disponible.</p>
          </div>
          <span className="settings-pill">POS</span>
        </div>

        <div className="setting-row">
          <div className="setting-row-info">
            <strong>Boleta</strong>
            <p className="settings-muted">Permite seleccionar Boleta de venta al cobrar.</p>
          </div>
          <SettingSwitch
            ariaLabel="Habilitar Boleta en POS"
            checked={settings.posBoletaEnabled}
            disabled={loading || saving}
            onChange={(checked) => updateSetting('posBoletaEnabled', checked)}
            onLabel="Habilitada"
            offLabel="Deshabilitada"
          />
        </div>

        <div className="setting-row">
          <div className="setting-row-info">
            <strong>Factura</strong>
            <p className="settings-muted">Permite seleccionar Factura al cobrar.</p>
          </div>
          <SettingSwitch
            ariaLabel="Habilitar Factura en POS"
            checked={settings.posFacturaEnabled}
            disabled={loading || saving}
            onChange={(checked) => updateSetting('posFacturaEnabled', checked)}
            onLabel="Habilitada"
            offLabel="Deshabilitada"
          />
        </div>
      </article>
      </section>

      <div className="settings-actionbar">
        <p className={`settings-actionbar-status${hasChanges ? ' has-changes' : ''}`}>
          {loading ? 'Cargando configuracion...' : hasChanges ? 'Tienes cambios sin guardar' : 'Todo guardado'}
        </p>
        <div className="settings-actionbar-buttons">
          <button type="button" className="admin-ghost-btn" onClick={reload} disabled={saving}>
            Recargar
          </button>
          <button type="button" className="admin-ghost-btn" onClick={resetChanges} disabled={loading || saving || !hasChanges}>
            Deshacer
          </button>
          <button type="button" className="admin-primary-btn" onClick={saveSettings} disabled={loading || saving || !hasChanges}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </section>
  );
}
