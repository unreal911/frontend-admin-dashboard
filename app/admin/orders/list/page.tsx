import type { Metadata } from 'next';
import { AdminOrdersListPage } from '@/components/admin-orders-list-page';

export const metadata: Metadata = {
  title: 'Admin | Pedidos',
  description: 'Listado y gestion de pedidos.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminOrdersListRoutePage() {
  return <AdminOrdersListPage />;
}
