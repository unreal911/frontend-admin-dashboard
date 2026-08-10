import type { Metadata } from 'next';
import { OwnerVerificationFlow } from '@/components/owner-verification-flow';
import { AuthFashionLayout } from '@/components/auth-fashion-layout';

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
    <AuthFashionLayout>
      <OwnerVerificationFlow token={token} />
    </AuthFashionLayout>
  );
}
