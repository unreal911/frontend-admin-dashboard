import { NextRequest } from 'next/server';
import { proxyAuthenticatedAdminRequest } from '@/lib/admin-authenticated-proxy';

export async function POST(_request: NextRequest, context: { params: Promise<{ alertId: string }> }) {
  const { alertId } = await context.params;
  return proxyAuthenticatedAdminRequest(`/tenant/alerts/${encodeURIComponent(alertId)}/dismiss`, { method: 'POST' });
}
