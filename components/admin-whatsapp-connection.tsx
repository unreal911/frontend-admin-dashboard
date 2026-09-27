'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { useAdminUi } from '@/components/admin-ui-provider';

type Connection = {
  id: string; displayPhone: string; status: string; lastErrorCode?: string | null;
  lastErrorMessage?: string | null; lastErrorAt?: string | null; connectedAt: string;
};
type ConnectionPayload = { enabled: boolean; appId: string; configId: string; apiVersion: string; connection: Connection | null };
type MetaSession = { wabaId: string; phoneNumberId: string };
type FbWindow = Window & { FB?: {
  init: (options: Record<string, unknown>) => void;
  login: (callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>) => void;
} };

function readMetaSession(event: MessageEvent): MetaSession | null {
  try {
    const host = new URL(event.origin).hostname;
    if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return null;
    const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (payload?.type !== 'WA_EMBEDDED_SIGNUP' || payload?.event !== 'FINISH') return null;
    const wabaId = String(payload.data?.waba_id || '');
    const phoneNumberId = String(payload.data?.phone_number_id || '');
    return wabaId && phoneNumberId ? { wabaId, phoneNumberId } : null;
  } catch { return null; }
}

export function AdminWhatsAppConnection() {
  const { user } = useAdminAuth();
  const { showAlert } = useAdminUi();
  const [payload, setPayload] = useState<ConnectionPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useRef<MetaSession | null>(null);
  const isOwner = user?.membership.role === 'OWNER';

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/attention/whatsapp/connection', { cache: 'no-store' });
    if (response.ok) setPayload(await response.json() as ConnectionPayload);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => { const value = readMetaSession(event); if (value) session.current = value; };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  async function ensureSdk(appId: string, apiVersion: string) {
    if (!(window as FbWindow).FB) await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-meta-whatsapp-sdk]');
      if (existing) { existing.addEventListener('load', () => resolve(), { once: true }); return; }
      const script = document.createElement('script');
      script.dataset.metaWhatsappSdk = 'true';
      script.src = 'https://connect.facebook.net/es_LA/sdk.js';
      script.async = true; script.onload = () => resolve(); script.onerror = () => reject(new Error('No se pudo abrir Meta.'));
      document.head.appendChild(script);
    });
    (window as FbWindow).FB?.init({ appId, cookie: false, xfbml: false, version: apiVersion });
  }

  async function connect() {
    if (!payload?.enabled || !isOwner) return;
    const pin = window.prompt('Crea un PIN de seis dígitos para registrar este número en Meta. Guárdalo en un lugar seguro.');
    if (pin === null) return;
    if (!/^\d{6}$/.test(pin.trim())) { showAlert('El PIN debe tener exactamente seis dígitos.', 'error'); return; }
    setBusy(true); session.current = null;
    try {
      await ensureSdk(payload.appId, payload.apiVersion);
      const code = await new Promise<string>((resolve, reject) => {
        (window as FbWindow).FB?.login((response) => {
          const value = String(response?.authResponse?.code || '').trim();
          if (value) resolve(value); else reject(new Error('La conexión se canceló o Meta no devolvió autorización.'));
        }, { config_id: payload.configId, response_type: 'code', override_default_response_type: true,
          extras: { setup: {} } });
      });
      const started = Date.now();
      while (!session.current && Date.now() - started < 3000) await new Promise((resolve) => setTimeout(resolve, 100));
      const selectedSession = session.current as unknown as MetaSession | null;
      if (!selectedSession?.wabaId || !selectedSession.phoneNumberId) throw new Error('Meta no devolvió el número. Completa todos los pasos e inténtalo otra vez.');
      const response = await fetch('/api/admin/attention/whatsapp/connection', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, wabaId: selectedSession.wabaId, phoneNumberId: selectedSession.phoneNumberId, pin: pin.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`${data?.message || 'No se pudo conectar.'}${data?.code ? ` (código ${data.code})` : ''}`);
      await load();
      showAlert(data?.status === 'CONNECTED' ? 'WhatsApp conectado. Envía un mensaje de prueba al número de la empresa.' : 'El número requiere una acción adicional. Revisa el detalle de la conexión.', data?.status === 'CONNECTED' ? 'success' : 'error');
    } catch (caught) { showAlert(caught instanceof Error ? caught.message : 'No se pudo conectar WhatsApp.', 'error'); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!isOwner || !window.confirm('¿Desconectar WhatsApp de esta empresa?')) return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/attention/whatsapp/disconnect', { method: 'POST' });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.message || 'No se pudo desconectar.'));
      await load();
    } catch (caught) { showAlert(caught instanceof Error ? caught.message : 'No se pudo desconectar.', 'error'); }
    finally { setBusy(false); }
  }

  const connection = payload?.connection;
  return <article className="admin-card">
    <h2>WhatsApp de la empresa</h2>
    {connection?.status === 'CONNECTED' ? <p><strong>{connection.displayPhone}</strong> · Conectado</p>
      : connection?.status === 'ACTION_REQUIRED' ? <p><strong>{connection.displayPhone}</strong> · Requiere acción</p>
      : <p>Sin número conectado. La bandeja registra mensajes en modo local.</p>}
    {connection?.lastErrorMessage ? <p role="alert">{connection.lastErrorMessage} {connection.lastErrorCode ? `(código ${connection.lastErrorCode})` : ''}</p> : null}
    {isOwner && payload?.enabled ? <div className="admin-table-actions">
      <button type="button" className="admin-primary-btn" disabled={busy} onClick={() => void connect()}>{busy ? 'Procesando…' : connection?.status === 'CONNECTED' ? 'Cambiar número' : 'Conectar WhatsApp'}</button>
      {connection ? <button type="button" className="admin-ghost-btn" disabled={busy} onClick={() => void disconnect()}>Desconectar</button> : null}
    </div> : null}
    {isOwner && payload && !payload.enabled ? <p>La plataforma aún debe configurar la aplicación de Meta para habilitar la conexión.</p> : null}
  </article>;
}
