import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pagina no encontrada | Frontend Admin Next',
  description: 'La ruta solicitada no existe o el contenido ya no esta disponible.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: '/login',
  },
};

export default function NotFoundPage() {
  return (
    <section className="placeholder-page">
      <h1>Pagina no encontrada</h1>
      <p>La ruta solicitada no existe dentro del panel administrativo.</p>
      <p>
        <Link href="/admin/dashboard" className="back-link">
          Volver al admin
        </Link>
      </p>
    </section>
  );
}
