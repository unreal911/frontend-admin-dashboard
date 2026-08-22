import type { Metadata } from 'next';
import { AcceptInvitationFlow } from '@/components/accept-invitation-flow';
import { AuthFashionLayout } from '@/components/auth-fashion-layout';

export const metadata: Metadata = {
  title: 'Aceptar invitación | Tienda SaaS',
  robots: { index: false, follow: false },
};

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return (
    <AuthFashionLayout wideForm>
      <AcceptInvitationFlow token={token} />
    </AuthFashionLayout>
  );
}
