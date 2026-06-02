'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json().catch(() => null);
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
        {isSubmitting ? 'Ingresando...' : 'Entrar'}
      </button>
    </form>
  );
}

