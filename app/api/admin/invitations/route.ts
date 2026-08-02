import { proxyAuthenticatedAdminRequest } from '@/lib/admin-authenticated-proxy';

export async function GET() {
  return proxyAuthenticatedAdminRequest('/tenant/invitations');
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyAuthenticatedAdminRequest('/tenant/invitations', {
    method: 'POST',
    body,
  });
}
