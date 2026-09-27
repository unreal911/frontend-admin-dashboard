'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type VerificationStatus = 'input' | 'loading' | 'success' | 'error';

export function OwnerVerificationFlow({
  token,
  initialIdentifier = '',
}: {
  token: string;
  initialIdentifier?: string;
}) {
  const [status, setStatus] = useState<VerificationStatus>(token ? 'loading' : 'input');
  const [message, setMessage] = useState(token ? 'Verificando tu cuenta...' : '');
  const [tenantName, setTenantName] = useState('');
  const [trialEndsAt, setTrialEndsAt] = useState('');
  const [identifier, setIdentifier] = useState(initialIdentifier.replace(/^\+51/, ''));
  const [code, setCode] = useState('');

  const verifyAndProvision = useCallback(async (
    credential: string,
    phone: string | null,
    manual: boolean,
  ) => {
    setStatus('loading');
    setMessage(manual ? 'Validando el código...' : 'Verificando tu cuenta...');
    const verification = await fetch('/api/public/signup/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: credential, ...(phone ? { identifier: phone } : {}) }),
    }).catch(() => null);
    if (!verification) {
      setStatus(manual ? 'input' : 'error');
      setMessage('No se pudo conectar con la verificación.');
      return;
    }
    const verified = await verification.json().catch(() => null);
    if (!verification.ok || !verified?.trialToken) {
      setStatus(manual ? 'input' : 'error');
      setMessage(String(verified?.message || 'La credencial es inválida o venció.'));
      return;
    }

    setMessage('Cuenta verificada. Preparando tu empresa...');
    const trial = await fetch('/api/public/signup/trial', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trialToken: verified.trialToken }),
    }).catch(() => null);
    const provisioned = await trial?.json().catch(() => null);
    if (!trial?.ok) {
      setStatus('error');
      setMessage(String(provisioned?.message || 'No se pudo crear la prueba.'));
      return;
    }

    setTenantName(String(provisioned?.tenant?.name || 'tu empresa'));
    setTrialEndsAt(String(provisioned?.tenant?.trialEndsAt || ''));
    setStatus('success');
    setMessage('Tu prueba de 15 días está lista.');
  }, []);

  useEffect(() => {
    if (!token) return;
    window.history.replaceState({}, '', '/signup/verify');
    void verifyAndProvision(token, null, false);
  }, [token, verifyAndProvision]);

  async function submitOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    await verifyAndProvision(code, identifier, true);
  }

  if (status === 'input') {
    return (
      <form className="auth-form-next" onSubmit={submitOtp}>
        <h2>Verifica tu WhatsApp</h2>
        <p>Ingresa el código de 6 dígitos que enviamos a tu número.</p>
        <label>
          Número de WhatsApp
          <span className="public-phone-input-next">
            <span className="public-phone-country-next" aria-label="Perú">🇵🇪</span>
            <span className="public-phone-prefix-next" aria-hidden="true">+51</span>
            <input
              name="identifier"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value.replace(/\D/g, '').slice(0, 9))}
              pattern="9[0-9]{8}"
              maxLength={9}
              required
            />
          </span>
        </label>
        <label>
          Código de verificación
          <input
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
        </label>
        {message ? <p className="auth-error">{message}</p> : null}
        <button type="submit">Verificar y crear mi empresa</button>
        <Link href="/login">Volver al inicio de sesión</Link>
      </form>
    );
  }

  return (
    <div className={`public-flow-status-next is-${status}`}>
      <h1>{status === 'success' ? tenantName : 'Verificación de cuenta'}</h1>
      <p>{message}</p>
      {status === 'success' && trialEndsAt ? (
        <p>Tu prueba estará activa hasta el {new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' }).format(new Date(trialEndsAt))}.</p>
      ) : null}
      {status === 'success' ? <Link href="/login">Ingresar a mi empresa</Link> : null}
      {status === 'error' ? (
        <>
          <p>Solicita una nueva credencial desde la pantalla de inicio de sesión.</p>
          <Link href="/login">Ir al inicio de sesión</Link>
        </>
      ) : null}
    </div>
  );
}
