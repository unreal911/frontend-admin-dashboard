import type { Metadata } from 'next';
import { AdminProductPage } from '@/components/admin-product-page';

export const metadata: Metadata = {
  title: 'Admin | Productos',
  description: 'Gestion de productos, variantes e imagenes.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminProductRoutePage() {
  return <AdminProductPage />;
}
