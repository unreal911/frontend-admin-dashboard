'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

interface InvitationInfo {
  email: string;
  role: string;
  status: string;
  existingAccount: boolean;
  tenant: { name: string; slug: string };
}

export function AcceptInvitationFlow({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    window.history.replaceState({}, '', '/accept-invitation');
    if (!token) {
      setError('El enlace de invitaci\u00f3n no es v\u00e1lido.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    void fetch('/api/public/invitations/inspect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (cancelled) return;
      if (!response.ok || !payload?.invitation) {
        setError(String(payload?.message || 'La invitaci\u00f3n no est\u00e1 disponible.'));
        return;
      }
      setInvitation(payload.invitation as InvitationInfo);
    }).catch(() => {
      if (!cancelled) setError('No se pudo consultar la invitaci\u00f3n.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/public/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          password: form.get('password'),
          ...(!invitation?.existingAccount ? {
            firstName: form.get('firstName'),
            lastName: form.get('lastName'),
          } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(String(payload?.message || 'No se pudo aceptar la invitaci\u00f3n.'));
        return;
      }
      setAccepted(true);
    } catch {
      setError('No se pudo conectar con el servicio de invitaciones.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>Consultando invitaci&oacute;n...</p>;
  if (accepted || invitation?.status === 'ACCEPTED') {
    return (
      <div className="public-flow-success-next">
        <h1>Invitaci&oacute;n aceptada</h1>
        <p>Ya puedes ingresar a {invitation?.tenant.name || 'tu empresa'} con tu correo.</p>
        <Link href="/login">Iniciar sesi&oacute;n</Link>
      </div>
    );
  }
  if (!invitation) {
    return (
      <div className="public-flow-status-next is-error">
        <h1>Invitaci&oacute;n no disponible</h1>
        <p>{error}</p>
        <Link href="/login">Volver al login</Link>
      </div>
    );
  }

  return (
    <div>
      <header className="public-flow-heading-next">
        <p>Te invitaron a</p>
        <h1>{invitation.tenant.name}</h1>
        <span>{invitation.email} &middot; {invitation.role}</span>
      </header>
      <form className="auth-form-next public-flow-form-next" onSubmit={submit}>
        {!invitation.existingAccount ? (
          <div className="public-flow-name-grid-next">
            <label>Nombre<input name="firstName" autoComplete="given-name" required /></label>
            <label>Apellido<input name="lastName" autoComplete="family-name" required /></label>
          </div>
        ) : null}
        <label>
          {invitation.existingAccount ? 'Confirma tu contrase\u00f1a' : 'Crea una contrase\u00f1a'}
          <input
            name="password"
            type="password"
            autoComplete={invitation.existingAccount ? 'current-password' : 'new-password'}
            minLength={invitation.existingAccount ? 1 : 12}
            maxLength={72}
            required
          />
        </label>
        {!invitation.existingAccount ? (
          <small>El enlace verifica tu correo. La contrase&ntilde;a debe incluir may&uacute;scula, min&uacute;scula, n&uacute;mero y s&iacute;mbolo.</small>
        ) : null}
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Aceptando...' : 'Aceptar invitaci\u00f3n'}
        </button>
      </form>
    </div>
  );
}
