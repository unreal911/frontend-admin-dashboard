import type { Metadata } from 'next';
import { AdminPosPage } from '@/components/admin-pos-page';

export const metadata: Metadata = {
  title: 'Admin | POS',
  description: 'Punto de venta para creacion de pedidos.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPosRoutePage() {
  return <AdminPosPage />;
}
