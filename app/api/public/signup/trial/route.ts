import { proxyPublicBackendRequest } from '@/lib/public-backend-proxy';

export async function POST(request: Request) {
  return proxyPublicBackendRequest(
    '/public/signup/trial',
    await request.json().catch(() => null),
  );
}
