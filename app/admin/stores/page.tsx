import type { Metadata } from 'next';
import { AdminStorePage } from '@/components/admin-store-page';

export const metadata: Metadata = {
  title: 'Admin | Tiendas',
  description: 'Gestion de tiendas y almacenes.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminStoresRoutePage() {
  return <AdminStorePage />;
}

