import type { Metadata } from 'next';
import { AdminColorPage } from '@/components/admin-color-page';

export const metadata: Metadata = {
  title: 'Admin | Colores',
  description: 'Gestion de colores del catalogo.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminColorRoutePage() {
  return <AdminColorPage />;
}
