import { proxyPublicBackendRequest } from '@/lib/public-backend-proxy';

export async function POST(request: Request) {
  return proxyPublicBackendRequest(
    '/public/invitations/accept',
    await request.json().catch(() => null),
  );
}
