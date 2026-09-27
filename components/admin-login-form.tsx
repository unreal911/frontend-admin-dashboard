'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { useEffect } from 'react';
import { PublicAuthPolicy } from '@/lib/public-auth-policy';

interface LoginTenant {
  id: string;
  slug: string;
  name: string;
  role: string;
}

type AccountIssue = 'EMAIL_VERIFICATION_REQUIRED' | 'TRIAL_SETUP_REQUIRED';

export function AdminLoginForm() {
  const [policy, setPolicy] = useState<PublicAuthPolicy | null>(null);
  const [policyStatus, setPolicyStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [policyRequest, setPolicyRequest] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [method, setMethod] = useState<'email' | 'whatsapp'>('email');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [tenants, setTenants] = useState<LoginTenant[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [accountIssue, setAccountIssue] = useState<AccountIssue | null>(null);

  useEffect(() => {
    fetch('/api/public/auth/policy', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.data || typeof payload.data !== 'object') {
          throw new Error('AUTH_POLICY_UNAVAILABLE');
        }
        return payload.data as PublicAuthPolicy;
      })
      .then((nextPolicy) => {
        setPolicy(nextPolicy);
        setPolicyStatus('ready');
      })
      .catch(() => {
        setPolicy(null);
        setPolicyStatus('error');
      });
  }, [policyRequest]);

  useEffect(() => {
    if (!policy) return;
    if (method === 'email' && !policy.loginEmailEnabled) setMethod('whatsapp');
    if (method === 'whatsapp' && !policy.loginWhatsappEnabled && policy.loginEmailEnabled) setMethod('email');
  }, [method, policy]);

  const emailEnabled = policy?.loginEmailEnabled ?? false;
  const whatsappEnabled = policy?.loginWhatsappEnabled ?? false;

  const returnUrl = useMemo(() => {
    const raw = String(searchParams.get('returnUrl') || '').trim();
    return raw.startsWith('/admin') ? raw : '/admin/dashboard';
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    setAccountIssue(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier, password, ...(tenantSlug ? { tenantSlug } : {}) }),
      });

      const result = await response.json().catch(() => null);
      if (response.status === 409 && result?.selectionRequired && Array.isArray(result?.tenants)) {
        const options = result.tenants
          .map((tenant: Record<string, unknown>) => ({
            id: String(tenant.id || ''),
            slug: String(tenant.slug || ''),
            name: String(tenant.name || ''),
            role: String(tenant.role || ''),
          }))
          .filter((tenant: LoginTenant) => tenant.id && tenant.slug && tenant.name);
        setTenants(options);
        setTenantSlug(options[0]?.slug || '');
        setErrorMessage('Selecciona la empresa a la que deseas ingresar.');
        return;
      }
      if (!response.ok || !result?.success) {
        setErrorMessage(String(result?.message || 'No se pudo iniciar sesion.'));
        if (
          result?.action === 'RESEND_VERIFICATION'
          && (result?.code === 'EMAIL_VERIFICATION_REQUIRED' || result?.code === 'TRIAL_SETUP_REQUIRED')
        ) {
          setAccountIssue(result.code);
        }
        return;
      }

      router.push(returnUrl);
      router.refresh();
    } catch {
      setErrorMessage('No se pudo conectar con el login del admin.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resendVerification() {
    setIsResending(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const response = await fetch('/api/public/signup/resend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setErrorMessage(String(result?.message || 'No se pudo reenviar la verificación.'));
        return;
      }
      setInfoMessage(String(result?.message || 'Revisa tu WhatsApp o correo para continuar.'));
    } catch {
      setErrorMessage('No se pudo conectar con el reenvío de activación.');
    } finally {
      setIsResending(false);
    }
  }

  if (policyStatus === 'loading') {
    return <p className="auth-info-next" role="status">Cargando métodos de acceso…</p>;
  }

  if (policyStatus === 'error' || !policy) {
    return (
      <div className="auth-form-next">
        <div className="auth-account-action-next" role="alert">
          <strong>No pudimos cargar los métodos de acceso</strong>
          <span>La configuración central del Superadmin no está disponible en este momento.</span>
          <button type="button" onClick={() => { setPolicyStatus('loading'); setPolicyRequest((value) => value + 1); }}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="auth-form-next" onSubmit={handleSubmit}>
      {emailEnabled && whatsappEnabled ? (
        <fieldset className="auth-channel-fieldset-next">
          <legend>Método de acceso</legend>
          <div className="auth-channel-options-next" role="radiogroup" aria-label="Método de acceso">
            <label className={`auth-channel-option-next${method === 'email' ? ' is-selected' : ''}`}>
              <input type="radio" name="loginMethod" checked={method === 'email'} onChange={() => { setMethod('email'); setIdentifier(''); }} />
              <span className="auth-channel-option-content-next">
                <strong>Correo</strong>
                <small>Usa el correo de tu cuenta</small>
              </span>
            </label>
            <label className={`auth-channel-option-next${method === 'whatsapp' ? ' is-selected' : ''}`}>
              <input type="radio" name="loginMethod" checked={method === 'whatsapp'} onChange={() => { setMethod('whatsapp'); setIdentifier(''); }} />
              <span className="auth-channel-option-content-next">
                <strong>WhatsApp</strong>
                <small>Usa tu número celular</small>
              </span>
            </label>
          </div>
          {method === 'email' ? (
            <input type="email" placeholder="correo@empresa.com" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required />
          ) : (
            <span className="public-phone-input-next">
              <span className="public-phone-country-next" aria-label="Perú">🇵🇪</span>
              <span className="public-phone-prefix-next" aria-hidden="true">+51</span>
              <input type="tel" inputMode="numeric" placeholder="987654321" value={identifier.replace(/^\+51/, '')} onChange={(event) => setIdentifier(event.target.value.replace(/\D/g, '').slice(0, 9))} autoComplete="tel-national" maxLength={9} pattern="9[0-9]{8}" required />
            </span>
          )}
        </fieldset>
      ) : emailEnabled ? (
        <label>
          Correo
          <input
            type="email"
            placeholder="correo@empresa.com"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
      ) : (
        <label>
          Número de WhatsApp
          <span className="public-phone-input-next">
            <span className="public-phone-country-next" aria-label="Perú">🇵🇪</span>
            <span className="public-phone-prefix-next" aria-hidden="true">+51</span>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="987654321"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value.replace(/\D/g, '').slice(0, 9))}
              autoComplete="tel-national"
              maxLength={9}
              pattern="9[0-9]{8}"
              required
            />
          </span>
        </label>
      )}
      {tenants.length > 1 ? (
        <label>
          Empresa
          <select
            value={tenantSlug}
            onChange={(event) => setTenantSlug(event.target.value)}
            required
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.slug}>
                {tenant.name} ({tenant.role})
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Contraseña
        <input
          type="password"
          placeholder="********"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
      {infoMessage ? <p className="auth-info-next" role="status">{infoMessage}</p> : null}
      {accountIssue ? (
        <div className="auth-account-action-next">
          <strong>{accountIssue === 'EMAIL_VERIFICATION_REQUIRED' ? 'Cuenta pendiente de activar' : 'Registro pendiente de completar'}</strong>
          <span>Usaremos el identificador y la contrase&ntilde;a ingresados para generar una credencial nueva.</span>
          <button type="button" onClick={resendVerification} disabled={isResending}>
            {isResending
              ? 'Enviando...'
              : accountIssue === 'EMAIL_VERIFICATION_REQUIRED'
                ? method === 'whatsapp' ? 'Reenviar código de activación' : 'Reenviar enlace de activación'
                : method === 'whatsapp' ? 'Enviar código para continuar' : 'Enviar enlace para continuar'}
          </button>
          {infoMessage && method === 'whatsapp' ? <Link href="/signup/verify">Ingresar código</Link> : null}
          <Link href="/signup">Volver al registro</Link>
        </div>
      ) : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Ingresando...' : tenants.length > 1 ? 'Entrar a la empresa' : 'Ingresar'}
      </button>
    </form>
  );
}
