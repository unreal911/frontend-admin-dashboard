export function getAdminApiUrl(): string {
  const raw = String(
    process.env.ADMIN_API_URL ||
    process.env.NEXT_PUBLIC_ADMIN_API_URL ||
    'http://localhost:3001/api',
  ).trim();

  const normalized = raw.replace(/\/+$/, '');

  // Si solo se proporciona dominio (sin path), asumimos /api para compatibilidad con backend actual.
  if (/^https?:\/\/[^/]+$/i.test(normalized)) {
    return `${normalized}/api`;
  }

  return normalized;
}
