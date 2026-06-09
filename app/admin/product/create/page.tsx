import type { Metadata } from 'next';
import { AdminProductCreatePage } from '@/components/admin-product-create-page';

export const metadata: Metadata = {
  title: 'Admin | Crear producto',
  description: 'Creacion de productos, variantes e imagenes.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminProductCreateRoutePage() {
  return <AdminProductCreatePage />;
}
