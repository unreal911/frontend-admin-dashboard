import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminInventoryTraceabilityPage } from '@/components/admin-inventory-traceability-page';

export const metadata: Metadata = {
  title: 'Admin | Trazabilidad de Inventario',
  description: 'Trazabilidad de reservas por inventario y pedido.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminInventoryTraceabilityRoutePage() {
  return (
    <Suspense fallback={<article className="admin-card"><p>Cargando modulo de trazabilidad...</p></article>}>
      <AdminInventoryTraceabilityPage />
    </Suspense>
  );
}
