import { proxyAuthenticatedAdminRequest } from '@/lib/admin-authenticated-proxy';

export async function GET(_request: Request, context: { params: Promise<{ planVersionId: string }> }) {
  const { planVersionId } = await context.params;
  return proxyAuthenticatedAdminRequest(`/tenant/subscription/downgrade-preview/${encodeURIComponent(planVersionId)}`);
}
