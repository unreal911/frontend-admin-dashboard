import { proxyPublicBackendRequest } from '@/lib/public-backend-proxy';

export async function POST(request: Request) {
  return proxyPublicBackendRequest(
    '/auth/password-reset/request',
    await request.json().catch(() => null),
  );
}
