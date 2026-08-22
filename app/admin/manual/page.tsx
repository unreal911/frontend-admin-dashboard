import type { Metadata } from 'next';
import { AdminUserManualPage } from '@/components/admin-user-manual-page';

export const metadata: Metadata = {
  title: 'Admin | Manual de usuario',
  description: 'Guia paso a paso para clientes que empiezan a usar el sistema.',
  robots: { index: false, follow: false },
};

export default function AdminManualRoutePage() {
  return <AdminUserManualPage />;
}
