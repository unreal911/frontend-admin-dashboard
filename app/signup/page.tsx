import type { Metadata } from 'next';
import Link from 'next/link';
import { OwnerSignupForm } from '@/components/owner-signup-form';

export const metadata: Metadata = {
  title: 'Crear prueba | Tienda SaaS',
  description: 'Crea una prueba aislada de 15 d\u00edas.',
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <section className="auth-shell public-flow-shell-next">
      <article className="auth-card-next public-flow-card-next">
        <p className="public-flow-kicker-next">Prueba compartida y aislada</p>
        <h1>Crea tu empresa</h1>
        <p>Verifica tu correo y empieza una prueba de 15 d&iacute;as.</p>
        <OwnerSignupForm />
        <div className="auth-links-next"><Link href="/login">Ya tengo una cuenta</Link></div>
      </article>
    </section>
  );
}
