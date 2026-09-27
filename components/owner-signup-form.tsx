'use client';

import Link from 'next/link';
import Script from 'next/script';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { validatePasswordConfirmation } from '@/lib/password-confirmation';
import { signupRateLimitMessage } from '@/lib/public-request-metadata';
import { DEFAULT_PUBLIC_AUTH_POLICY, PublicAuthPolicy } from '@/lib/public-auth-policy';
import { OwnerVerificationFlow } from '@/components/owner-verification-flow';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

function deviceIdentifier(): string {
  const key = 'owner_signup_device_id';
  const stored = window.localStorage.getItem(key);
  if (stored) return stored;
  const generated = window.crypto.randomUUID();
  window.localStorage.setItem(key, generated);
  return generated;
}

export function OwnerSignupForm() {
  const siteKey = String(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '').trim();
  const [policy, setPolicy] = useState<PublicAuthPolicy>(DEFAULT_PUBLIC_AUTH_POLICY);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [verificationIdentifier, setVerificationIdentifier] = useState('');
  const [channel, setChannel] = useState<'phone' | 'email'>('phone');

  useEffect(() => {
    fetch('/api/public/auth/policy', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.data && typeof payload.data === 'object') setPolicy(payload.data as PublicAuthPolicy);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (channel === 'email' && !policy.signupEmailEnabled) setChannel('phone');
    if (channel === 'phone' && !policy.signupWhatsappEnabled && policy.signupEmailEnabled) setChannel('email');
  }, [channel, policy.signupEmailEnabled, policy.signupWhatsappEnabled]);

  const emailEnabled = policy.signupEmailEnabled;
  const whatsappEnabled = policy.signupWhatsappEnabled;
  const noSignupChannel = !emailEnabled && !whatsappEnabled;

  useEffect(() => {
    if (!scriptReady || !siteKey || !widgetRef.current || !window.turnstile || widgetIdRef.current) return;
    const syncRenderedToken = () => {
      const input = widgetRef.current?.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
      if (input) setCaptchaToken(input.value.trim());
    };
    const tokenObserver = new MutationObserver(syncRenderedToken);
    tokenObserver.observe(widgetRef.current, {
      attributes: true,
      attributeFilter: ['value'],
      childList: true,
      subtree: true,
    });
    widgetIdRef.current = window.turnstile.render(widgetRef.current, {
      sitekey: siteKey,
      action: 'owner_signup',
      language: 'es',
      size: 'flexible',
      callback: (token: string) => setCaptchaToken(token),
      'expired-callback': () => setCaptchaToken(''),
      'error-callback': () => setCaptchaToken(''),
    });
    syncRenderedToken();
    return () => {
      tokenObserver.disconnect();
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [scriptReady, siteKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    const passwordConfirmationError = validatePasswordConfirmation(
      password,
      String(form.get('confirmPassword') || ''),
    );
    setError('');
    if (passwordConfirmationError) {
      setError(passwordConfirmationError);
      return;
    }
    if (!siteKey) {
      setError('El registro todav\u00eda no tiene CAPTCHA configurado.');
      return;
    }
    if (!captchaToken) {
      setError('Completa la verificaci\u00f3n antiabuso.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/public/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          businessName: form.get('businessName'),
          email: emailEnabled && channel === 'email' ? form.get('email') : null,
          phone: channel === 'phone' ? form.get('phone') : null,
          password,
          termsAccepted: form.get('termsAccepted') === 'on',
          captchaToken,
          deviceId: deviceIdentifier(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(response.status === 429
          ? signupRateLimitMessage(response.headers.get('retry-after'))
          : String(payload?.message || 'No se pudo procesar el registro.'));
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
          setCaptchaToken('');
        }
        return;
      }
      setVerificationIdentifier(channel === 'phone' ? String(form.get('phone') || '') : '');
      setSent(true);
    } catch {
      setError('No se pudo conectar con el registro.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    if (channel === 'phone') {
      return <OwnerVerificationFlow token="" initialIdentifier={verificationIdentifier} />;
    }
    return (
      <div className="public-flow-success-next">
        <h2>Contin&uacute;a seg&uacute;n el estado de tu cuenta</h2>
        <div className="public-flow-next-steps">
          <p><strong>Cuenta nueva:</strong> revisa tu correo y abre el enlace de activaci&oacute;n.</p>
          <p><strong>Cuenta ya creada:</strong> no recibir&aacute;s otro enlace; inicia sesi&oacute;n directamente.</p>
          <p><strong>No encuentras el mensaje:</strong> solicita un nuevo enlace desde Login.</p>
        </div>
        <Link href="/login">Ir al inicio de sesi&oacute;n</Link>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <form className="auth-form-next public-flow-form-next" onSubmit={submit}>
        <div className="public-flow-name-grid-next">
          <label>
            Nombre
            <input name="firstName" autoComplete="given-name" maxLength={100} required />
          </label>
          <label>
            Apellido
            <input name="lastName" autoComplete="family-name" maxLength={100} required />
          </label>
        </div>
        <label>
          Empresa
          <input name="businessName" autoComplete="organization" maxLength={120} required />
        </label>
        {emailEnabled && whatsappEnabled ? (
          <fieldset className="auth-channel-fieldset-next">
            <legend>¿Dónde quieres recibir la verificación?</legend>
            <div className="auth-channel-options-next" role="radiogroup" aria-label="Canal de registro">
              <label className={`auth-channel-option-next${channel === 'phone' ? ' is-selected' : ''}`}>
              <input type="radio" name="signupChannel" value="phone" checked={channel === 'phone'} onChange={() => setChannel('phone')} />
                <span className="auth-channel-option-content-next">
                  <strong>WhatsApp</strong>
                  <small>Recibe un código en tu celular</small>
                </span>
              </label>
              <label className={`auth-channel-option-next${channel === 'email' ? ' is-selected' : ''}`}>
              <input type="radio" name="signupChannel" value="email" checked={channel === 'email'} onChange={() => setChannel('email')} />
                <span className="auth-channel-option-content-next">
                  <strong>Correo</strong>
                  <small>Recibe el enlace en tu bandeja</small>
                </span>
              </label>
            </div>
          </fieldset>
        ) : null}
        {noSignupChannel ? <p className="auth-error">El registro está temporalmente deshabilitado.</p> : null}
        {channel === 'phone' ? (
          <label>
            Número de WhatsApp
            <span className="public-phone-input-next">
              <span className="public-phone-country-next" aria-label="Perú">🇵🇪</span>
              <span className="public-phone-prefix-next" aria-hidden="true">+51</span>
              <input
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="987654321"
                maxLength={9}
                pattern="9[0-9]{8}"
                onInput={(event) => {
                  event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '').slice(0, 9);
                }}
                required
              />
            </span>
            <small>Ingresa los 9 dígitos de tu celular peruano.</small>
          </label>
        ) : (
          <label>
            Correo
            <input name="email" type="email" autoComplete="email" maxLength={320} required />
          </label>
        )}
        <label>
          Contrase&ntilde;a
          <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required />
          <small>12 caracteres como m&iacute;nimo; incluye may&uacute;scula, min&uacute;scula, n&uacute;mero y s&iacute;mbolo.</small>
        </label>
        <label>
          Repetir contrase&ntilde;a
          <input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required />
        </label>
        <label className="public-flow-check-next">
          <input name="termsAccepted" type="checkbox" required />
          Acepto los t&eacute;rminos y la pol&iacute;tica de privacidad.
        </label>
        <div ref={widgetRef} className="public-turnstile-next" />
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" disabled={submitting || !captchaToken || noSignupChannel}>
          {submitting ? 'Creando registro...' : 'Iniciar prueba de 15 d\u00edas'}
        </button>
      </form>
    </>
  );
}
