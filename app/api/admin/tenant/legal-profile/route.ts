import { NextRequest } from 'next/server';
import { proxyAuthenticatedAdminRequest } from '@/lib/admin-authenticated-proxy';

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyAuthenticatedAdminRequest('/tenant/legal-profile', { method: 'PUT', body });
}
