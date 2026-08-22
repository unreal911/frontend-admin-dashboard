export function resolveForwardedClientIp(headers: Headers): string | null {
  const forwardedFor = String(headers.get('x-forwarded-for') || '')
    .split(',')[0]
    ?.trim();
  const candidate = forwardedFor || String(headers.get('x-real-ip') || '').trim();
  if (!candidate || /[\r\n]/.test(candidate)) {
    return null;
  }
  return candidate.slice(0, 120);
}

export function signupRateLimitMessage(retryAfterHeader: string | null): string {
  const retryAfterSeconds = Number(retryAfterHeader);
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return 'Demasiados intentos. Espera unos minutos e intenta nuevamente.';
  }
  const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Demasiados intentos. Intenta nuevamente en ${retryAfterMinutes} minuto${retryAfterMinutes === 1 ? '' : 's'}.`;
}
