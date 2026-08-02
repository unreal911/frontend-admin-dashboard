'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';

interface LoginTenant {
  id: string;
  slug: string;
  name: string;
  role: string;
}

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [tenants, setTenants] = useState<LoginTenant[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const returnUrl = useMemo(() => {
    const raw = String(searchParams.get('returnUrl') || '').trim();
    return raw.startsWith('/admin') ? raw : '/admin/dashboard';
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
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
        Contrasena
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
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Ingresando...' : tenants.length > 1 ? 'Entrar a la empresa' : 'Entrar'}
      </button>
    </form>
  );
}
