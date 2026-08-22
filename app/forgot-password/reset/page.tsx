import type { Metadata } from 'next';
import { PasswordResetConfirmForm } from '@/components/password-reset-confirm-form';
import { AuthFashionLayout } from '@/components/auth-fashion-layout';

export const metadata: Metadata = {
  title: 'Nueva contraseña | Tienda SaaS',
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return (
    <AuthFashionLayout
      eyebrow="Acceso seguro"
      title="Crea una nueva contraseña"
      description="Este enlace es personal, vence pronto y sólo puede utilizarse una vez."
    >
      <PasswordResetConfirmForm token={token} />
    </AuthFashionLayout>
  );
}
