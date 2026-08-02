'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export function OwnerVerificationFlow({ token }: { token: string }) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verificando tu correo...');
  const [tenantName, setTenantName] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/signup/verify');
    }
    if (!token) {
      setStatus('error');
      setMessage('El enlace de verificaci\u00f3n no contiene una credencial v\u00e1lida.');
      return;
    }

    let cancelled = false;
    void (async () => {
      const verification = await fetch('/api/public/signup/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => null);
      if (!verification) {
        if (!cancelled) {
          setStatus('error');
          setMessage('No se pudo conectar con la verificaci\u00f3n.');
        }
        return;
      }
      const verified = await verification.json().catch(() => null);
      if (!verification.ok || !verified?.trialToken) {
        if (!cancelled) {
          setStatus('error');
          setMessage(String(verified?.message || 'El enlace es inv\u00e1lido o venci\u00f3.'));
        }
        return;
      }
      if (!cancelled) setMessage('Correo verificado. Preparando tu empresa...');
      const trial = await fetch('/api/public/signup/trial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trialToken: verified.trialToken }),
      }).catch(() => null);
      const provisioned = await trial?.json().catch(() => null);
      if (!trial?.ok) {
        if (!cancelled) {
          setStatus('error');
          setMessage(String(provisioned?.message || 'No se pudo crear la prueba.'));
        }
        return;
      }
      if (!cancelled) {
        setTenantName(String(provisioned?.tenant?.name || 'tu empresa'));
        setStatus('success');
        setMessage('Tu prueba de 15 d\u00edas est\u00e1 lista.');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className={`public-flow-status-next is-${status}`}>
      <h1>{status === 'success' ? tenantName : 'Verificaci\u00f3n de correo'}</h1>
      <p>{message}</p>
      {status === 'success' ? <Link href="/login">Ingresar a mi empresa</Link> : null}
      {status === 'error' ? <Link href="/signup">Solicitar un registro nuevo</Link> : null}
    </div>
  );
}
