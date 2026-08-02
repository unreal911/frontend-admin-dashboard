import { proxyPublicBackendRequest } from '@/lib/public-backend-proxy';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const deviceId = String(body?.deviceId || '').trim();
  return proxyPublicBackendRequest('/public/signup', body, {
    ...(deviceId ? { 'x-signup-device-id': deviceId } : {}),
    'user-agent': request.headers.get('user-agent') || 'admin-signup-bff',
    'accept-language': request.headers.get('accept-language') || 'es',
  });
}
