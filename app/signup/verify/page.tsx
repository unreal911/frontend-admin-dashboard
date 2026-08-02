import type { Metadata } from 'next';
import { OwnerVerificationFlow } from '@/components/owner-verification-flow';

export const metadata: Metadata = {
  title: 'Verificar correo | Tienda SaaS',
  robots: { index: false, follow: false },
};

export default async function VerifySignupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return (
    <section className="auth-shell public-flow-shell-next">
      <article className="auth-card-next public-flow-card-next">
        <OwnerVerificationFlow token={token} />
      </article>
    </section>
  );
}
