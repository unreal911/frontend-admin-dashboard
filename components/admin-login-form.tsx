'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';

interface LoginTenant {
  id: string;
  slug: string;
  name: string;
  role: string;
}

type AccountIssue = 'EMAIL_VERIFICATION_REQUIRED' | 'TRIAL_SETUP_REQUIRED';

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [tenants, setTenants] = useState<LoginTenant[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [accountIssue, setAccountIssue] = useState<AccountIssue | null>(null);

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
        body: JSON.stringify({ email, password, ...(tenantSlug ? { tenantSlug } : {}) }),
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
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setErrorMessage(String(result?.message || 'No se pudo reenviar el enlace.'));
        return;
      }
      setInfoMessage(String(result?.message || 'Revisa tu correo para continuar.'));
    } catch {
      setErrorMessage('No se pudo conectar con el reenvío de activación.');
    } finally {
      setIsResending(false);
    }
  }

  return (
    <form className="auth-form-next" onSubmit={handleSubmit}>
      <label>
        Correo
        <input
          type="email"
          placeholder="admin@empresa.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
      </label>
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
          <span>Usaremos el correo y la contrase&ntilde;a ingresados para generar un enlace nuevo.</span>
          <button type="button" onClick={resendVerification} disabled={isResending}>
            {isResending
              ? 'Enviando...'
              : accountIssue === 'EMAIL_VERIFICATION_REQUIRED'
                ? 'Reenviar correo de activación'
                : 'Enviar enlace para continuar'}
          </button>
          <Link href="/signup">Volver al registro</Link>
        </div>
      ) : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Ingresando...' : tenants.length > 1 ? 'Entrar a la empresa' : 'Ingresar'}
      </button>
    </form>
  );
}
