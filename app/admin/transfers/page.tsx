import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminTransfersPage } from '@/components/admin-transfers-page';

export const metadata: Metadata = {
  title: 'Admin | Transferencias',
  description: 'Gestion de transferencias de stock entre tiendas.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminTransfersRoutePage() {
  return (
    <Suspense fallback={<article className="admin-card"><p>Cargando modulo de transferencias...</p></article>}>
      <AdminTransfersPage />
    </Suspense>
  );
}
