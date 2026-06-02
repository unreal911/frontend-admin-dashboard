import type { Metadata } from 'next';
import { AdminRolesPage } from '@/components/admin-roles-page';

export const metadata: Metadata = {
  title: 'Admin | Roles',
  description: 'Gestion de roles y permisos.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminRolesRoutePage() {
  return <AdminRolesPage />;
}

