import type { Metadata } from 'next';
import { AdminCustomersPage } from '@/components/admin-customers-page';

export const metadata: Metadata = {
  title: 'Admin | Clientes',
  description: 'Registro de clientes de la empresa.',
  robots: { index: false, follow: false },
};

export default function AdminCustomersRoutePage() {
  return <AdminCustomersPage />;
}
