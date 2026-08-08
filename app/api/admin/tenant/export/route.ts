import { proxyAuthenticatedAdminRequest } from '@/lib/admin-authenticated-proxy';

export async function GET() {
  return proxyAuthenticatedAdminRequest('/tenant/export', { responseType: 'binary' });
}
