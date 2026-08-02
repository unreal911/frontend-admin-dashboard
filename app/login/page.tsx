import Link from 'next/link';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminLoginForm } from '@/components/admin-login-form';

export const metadata: Metadata = {
  title: 'Login | Frontend Admin Next',
  description: 'Acceso al panel administrativo.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  return (
    <section className="auth-shell">
      <article className="auth-card-next">
        <h1>Ingresar</h1>
        <p>Acceso al panel administrativo.</p>
        <Suspense fallback={<p>Cargando login...</p>}>
          <AdminLoginForm />
        </Suspense>
        <div className="auth-links-next">
          <Link href="/signup">Crear una prueba de 15 d&iacute;as</Link>
        </div>
      </article>
    </section>
  );
}
