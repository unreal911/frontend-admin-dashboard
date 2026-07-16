import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminInventoryProductPage } from '@/components/admin-inventory-product-page';

export const metadata: Metadata = {
  title: 'Admin | Administrar variantes',
  description: 'Matriz de inventario por color y talla de un producto.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminInventoryProductRoutePage() {
  return (
    <Suspense fallback={<article className="admin-card"><p>Cargando inventario del producto...</p></article>}>
      <AdminInventoryProductPage />
    </Suspense>
  );
}
