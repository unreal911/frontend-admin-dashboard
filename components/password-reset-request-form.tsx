'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useEffect } from 'react';
import { DEFAULT_PUBLIC_AUTH_POLICY, PublicAuthPolicy } from '@/lib/public-auth-policy';
import { PasswordResetConfirmForm } from '@/components/password-reset-confirm-form';

export function PasswordResetRequestForm() {
  const [identifier, setIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [policy, setPolicy] = useState<PublicAuthPolicy>(DEFAULT_PUBLIC_AUTH_POLICY);
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('whatsapp');

  useEffect(() => {
    fetch('/api/public/auth/policy', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.data && typeof payload.data === 'object') setPolicy(payload.data as PublicAuthPolicy);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (channel === 'email' && !policy.passwordResetEmailEnabled) setChannel('whatsapp');
    if (channel === 'whatsapp' && !policy.passwordResetWhatsappEnabled && policy.passwordResetEmailEnabled) setChannel('email');
  }, [channel, policy.passwordResetEmailEnabled, policy.passwordResetWhatsappEnabled]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/public/password-reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(String(result?.message || 'No se pudo solicitar la recuperación.'));
        return;
      }
      setMessage(String(result?.message || 'Revisa tu correo para continuar.'));
    } catch {
      setError('No se pudo conectar con la recuperación de contraseña.');
    } finally {
      setSubmitting(false);
    }
  }

  if (message) {
    if (channel === 'whatsapp') {
      return <PasswordResetConfirmForm token="" identifier={identifier} />;
    }
    return (
      <div className="public-flow-success-next" role="status">
        <h2>Revisa tu correo o WhatsApp</h2>
        <p>{message}</p>
        <p>El enlace vence en 30 minutos. Revisa también la carpeta de spam.</p>
        <Link href="/login">Volver al inicio de sesión</Link>
      </div>
    );
  }

  return (
    <form className="auth-form-next" onSubmit={submit}>
      {policy.passwordResetEmailEnabled && policy.passwordResetWhatsappEnabled ? (
        <fieldset className="auth-channel-fieldset-next">
          <legend>Enviar recuperación por</legend>
          <div className="auth-channel-options-next" role="radiogroup" aria-label="Canal de recuperación">
            <label className={`auth-channel-option-next${channel === 'email' ? ' is-selected' : ''}`}>
              <input type="radio" name="resetChannel" checked={channel === 'email'} onChange={() => { setChannel('email'); setIdentifier(''); }} />
              <span className="auth-channel-option-content-next">
                <strong>Correo</strong>
                <small>Recibe el enlace en tu bandeja</small>
              </span>
            </label>
            <label className={`auth-channel-option-next${channel === 'whatsapp' ? ' is-selected' : ''}`}>
              <input type="radio" name="resetChannel" checked={channel === 'whatsapp'} onChange={() => { setChannel('whatsapp'); setIdentifier(''); }} />
              <span className="auth-channel-option-content-next">
                <strong>WhatsApp</strong>
                <small>Recibe un código en tu celular</small>
              </span>
            </label>
          </div>
        </fieldset>
      ) : null}
      <label>
        {channel === 'email' ? 'Correo de tu cuenta' : 'Número de WhatsApp de tu cuenta'}
        <input
          type={channel === 'email' ? 'email' : 'tel'}
          inputMode={channel === 'email' ? 'email' : 'numeric'}
          value={identifier}
          onChange={(event) => setIdentifier(channel === 'email' ? event.target.value : event.target.value.replace(/\D/g, '').slice(0, 9))}
          placeholder={channel === 'email' ? 'correo@empresa.com' : '987654321'}
          autoComplete={channel === 'email' ? 'email' : 'tel-national'}
          maxLength={channel === 'email' ? 320 : 9}
          pattern={channel === 'email' ? undefined : '9[0-9]{8}'}
          required
        />
      </label>
      {error ? <p className="auth-error">{error}</p> : null}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Enviando...' : channel === 'whatsapp' ? 'Enviar código de recuperación' : 'Enviar enlace de recuperación'}
      </button>
    </form>
  );
}
