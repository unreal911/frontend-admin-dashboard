import type { Metadata } from 'next';
import { AdminDashboardPage } from '@/components/admin-dashboard-page';

export const metadata: Metadata = {
  title: 'Admin | Dashboard',
  description: 'Resumen operativo de ventas, pedidos, inventario y alertas.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminDashboardRoutePage() {
  return <AdminDashboardPage />;
}
