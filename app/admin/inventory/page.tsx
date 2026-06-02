import type { Metadata } from 'next';
import { AdminInventoryPage } from '@/components/admin-inventory-page';

export const metadata: Metadata = {
  title: 'Admin | Inventario',
  description: 'Vista general de inventario con filtros y ajustes.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminInventoryRoutePage() {
  return <AdminInventoryPage />;
}
