import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminInventoryMovementsPage } from '@/components/admin-inventory-movements-page';

export const metadata: Metadata = {
  title: 'Admin | Movimientos de Inventario',
  description: 'Historial de movimientos de inventario.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminInventoryMovementsRoutePage() {
  return (
    <Suspense fallback={<article className="admin-card"><p>Cargando modulo de movimientos...</p></article>}>
      <AdminInventoryMovementsPage />
    </Suspense>
  );
}
