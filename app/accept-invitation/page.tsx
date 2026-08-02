import type { Metadata } from 'next';
import { AcceptInvitationFlow } from '@/components/accept-invitation-flow';

export const metadata: Metadata = {
  title: 'Aceptar invitaci\u00f3n | Tienda SaaS',
  robots: { index: false, follow: false },
};

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return (
    <section className="auth-shell public-flow-shell-next">
      <article className="auth-card-next public-flow-card-next">
        <AcceptInvitationFlow token={token} />
      </article>
    </section>
  );
}
