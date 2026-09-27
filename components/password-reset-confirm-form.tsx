'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { validatePasswordConfirmation } from '@/lib/password-confirmation';

export function PasswordResetConfirmForm({
  token,
  identifier = '',
}: {
  token: string;
  identifier?: string;
}) {
  const usesWhatsappOtp = !token && Boolean(identifier);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const confirmationError = validatePasswordConfirmation(password, confirmation);
    if (confirmationError) {
      setError(confirmationError);
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/public/password-reset/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: usesWhatsappOtp ? code : token,
          password,
          ...(usesWhatsappOtp ? { identifier } : {}),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(String(result?.message || 'No se pudo actualizar la contraseña.'));
        return;
      }
      setPassword('');
      setConfirmation('');
      setCompleted(true);
    } catch {
      setError('No se pudo conectar con la recuperación de contraseña.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token && !usesWhatsappOtp) {
    return (
      <div className="public-flow-success-next">
        <h2>Enlace no válido</h2>
        <p>Solicita un enlace nuevo para recuperar tu contraseña.</p>
        <Link href="/forgot-password">Solicitar otro enlace</Link>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="public-flow-success-next" role="status">
        <h2>Contraseña actualizada</h2>
        <p>La contraseña anterior y las sesiones abiertas dejaron de ser válidas.</p>
        <Link href="/login">Iniciar sesión</Link>
      </div>
    );
  }

  return (
    <form className="auth-form-next" onSubmit={submit}>
      {usesWhatsappOtp ? (
        <>
          <h2>Ingresa el código de WhatsApp</h2>
          <p>El código tiene 6 dígitos, vence en 10 minutos y admite un máximo de 5 intentos.</p>
          <label>
            Código de recuperación
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
        </>
      ) : null}
      <label>
        Nueva contraseña
        <input
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
          required
        />
        <small>12 caracteres como mínimo; incluye mayúscula, minúscula, número y símbolo.</small>
      </label>
      <label>
        Repetir nueva contraseña
        <input
          name="confirmPassword"
          type="password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
          required
        />
      </label>
      {error ? <p className="auth-error">{error}</p> : null}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Actualizando...' : usesWhatsappOtp ? 'Validar código y guardar contraseña' : 'Guardar nueva contraseña'}
      </button>
    </form>
  );
}
