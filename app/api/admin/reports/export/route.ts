import { proxyAuthenticatedAdminRequest } from '@/lib/admin-authenticated-proxy';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyAuthenticatedAdminRequest('/reports/export', { method: 'POST', body, responseType: 'binary' });
}
