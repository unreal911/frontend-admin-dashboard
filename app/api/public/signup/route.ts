import { proxyPublicBackendRequest } from '@/lib/public-backend-proxy';
import { resolveForwardedClientIp } from '@/lib/public-request-metadata';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const deviceId = String(body?.deviceId || '').trim();
  const clientIp = resolveForwardedClientIp(request.headers);
  return proxyPublicBackendRequest('/public/signup', body, {
    ...(deviceId ? { 'x-signup-device-id': deviceId } : {}),
    ...(clientIp ? { 'x-forwarded-for': clientIp } : {}),
    'user-agent': request.headers.get('user-agent') || 'admin-signup-bff',
    'accept-language': request.headers.get('accept-language') || 'es',
  });
}
