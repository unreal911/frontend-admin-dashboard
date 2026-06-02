import type { Metadata } from 'next';
import { AdminUsersPage } from '@/components/admin-users-page';

export const metadata: Metadata = {
  title: 'Admin | Usuarios',
  description: 'Gestion de usuarios del sistema.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminUsersRoutePage() {
  return <AdminUsersPage />;
}

