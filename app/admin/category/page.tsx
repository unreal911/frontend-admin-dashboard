import type { Metadata } from 'next';
import { AdminCategoryPage } from '@/components/admin-category-page';

export const metadata: Metadata = {
  title: 'Admin | Categorias',
  description: 'Gestion de categorias del catalogo.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminCategoryRoutePage() {
  return <AdminCategoryPage />;
}

