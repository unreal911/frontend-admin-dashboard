import Link from 'next/link';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminLoginForm } from '@/components/admin-login-form';
import { AuthFashionLayout } from '@/components/auth-fashion-layout';

export const metadata: Metadata = {
  title: 'Ingresar | Tienda SaaS',
  description: 'Acceso al panel administrativo.',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthFashionLayout
      eyebrow="Bienvenido de nuevo"
      title="Ingresa a tu tienda"
      description="Continúa gestionando tus ventas, productos e inventario."
      footer={(
        <>
          <Link href="/forgot-password">Olvidé mi contraseña</Link>
          <Link href="/signup">Crear una prueba de 15 días</Link>
        </>
      )}
    >
      <Suspense fallback={<p>Cargando login...</p>}>
        <AdminLoginForm />
      </Suspense>
    </AuthFashionLayout>
  );
}
