import type { Metadata } from 'next';
import Link from 'next/link';
import { OwnerSignupForm } from '@/components/owner-signup-form';
import { AuthFashionLayout } from '@/components/auth-fashion-layout';

export const metadata: Metadata = {
  title: 'Crear prueba | Tienda SaaS',
  description: 'Crea una prueba aislada de 15 días.',
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <AuthFashionLayout
      eyebrow="Prueba compartida y aislada"
      title="Crea tu empresa"
      description="Verifica tu correo y empieza una prueba de 15 días."
      footer={<Link href="/login">Ya tengo una cuenta</Link>}
      wideForm
    >
      <OwnerSignupForm />
    </AuthFashionLayout>
  );
}
