import { proxyAuthenticatedAdminRequest } from '@/lib/admin-authenticated-proxy';

export async function GET() {
  return proxyAuthenticatedAdminRequest('/tenant/subscription/payment-requests');
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyAuthenticatedAdminRequest('/tenant/subscription/payment-requests', { method: 'POST', body });
}
