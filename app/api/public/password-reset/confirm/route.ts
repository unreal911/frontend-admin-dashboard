import { proxyPublicBackendRequest } from '@/lib/public-backend-proxy';

export async function POST(request: Request) {
  return proxyPublicBackendRequest(
    '/auth/password-reset/confirm',
    await request.json().catch(() => null),
  );
}
