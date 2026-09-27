import type { Metadata } from 'next';
import { AdminOrdersHubPage } from '@/components/admin-orders-hub-page';

export const metadata: Metadata = {
  title: 'Admin | Pedidos',
  description: 'Listado y gestion de pedidos.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminOrdersListRoutePage() {
  return <AdminOrdersHubPage />;
}
