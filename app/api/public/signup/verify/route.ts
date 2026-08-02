import { proxyPublicBackendRequest } from '@/lib/public-backend-proxy';

export async function POST(request: Request) {
  return proxyPublicBackendRequest(
    '/public/signup/verify',
    await request.json().catch(() => null),
  );
}
