import { proxyAuthenticatedAdminRequest } from '@/lib/admin-authenticated-proxy';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyAuthenticatedAdminRequest(`/tenant/invitations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
