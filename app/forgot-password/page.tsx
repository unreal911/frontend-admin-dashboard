import Link from 'next/link';
import type { Metadata } from 'next';
import { PasswordResetRequestForm } from '@/components/password-reset-request-form';
import { AuthFashionLayout } from '@/components/auth-fashion-layout';

export const metadata: Metadata = {
  title: 'Recuperar contraseña | Tienda SaaS',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthFashionLayout
      eyebrow="Acceso seguro"
      title="Recupera tu contraseña"
      description="Te enviaremos un enlace temporal si el correo pertenece a una cuenta activa."
      footer={<Link href="/login">Volver al login</Link>}
    >
      <PasswordResetRequestForm />
    </AuthFashionLayout>
  );
}
