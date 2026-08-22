'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

export function PasswordResetRequestForm() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/public/password-reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
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
    return (
      <div className="public-flow-success-next" role="status">
        <h2>Revisa tu correo</h2>
        <p>{message}</p>
        <p>El enlace vence en 30 minutos. Revisa también la carpeta de spam.</p>
        <Link href="/login">Volver al inicio de sesión</Link>
      </div>
    );
  }

  return (
    <form className="auth-form-next" onSubmit={submit}>
      <label>
        Correo de tu cuenta
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
      </label>
      {error ? <p className="auth-error">{error}</p> : null}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Enviando...' : 'Enviar enlace de recuperación'}
      </button>
    </form>
  );
}
