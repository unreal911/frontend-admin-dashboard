import type { Metadata } from 'next';
import { AdminSizePage } from '@/components/admin-size-page';

export const metadata: Metadata = {
  title: 'Admin | Tallas',
  description: 'Gestion de tallas del catalogo.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminSizeRoutePage() {
  return <AdminSizePage />;
}
