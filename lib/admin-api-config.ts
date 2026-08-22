export function getAdminApiUrl(): string {
  const raw = String(
    process.env.ADMIN_API_URL ||
    process.env.NEXT_PUBLIC_ADMIN_API_URL ||
    'http://localhost:3001/api',
  ).trim();

  const normalized = raw.replace(/\/+$/, '');

  if (
    process.env.VERCEL_ENV === 'preview'
    && process.env.ALLOW_PRODUCTION_API_IN_PREVIEW !== 'true'
    && /production|prod\./i.test(normalized)
  ) {
    throw new Error('Un preview de Vercel no puede usar la API productiva');
  }

  // Si solo se proporciona dominio (sin path), asumimos /api para compatibilidad con backend actual.
  if (/^https?:\/\/[^/]+$/i.test(normalized)) {
    return `${normalized}/api`;
  }

  return normalized;
}
