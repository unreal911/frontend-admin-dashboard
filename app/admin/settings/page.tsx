import type { Metadata } from 'next';
import { AdminSettingsPage } from '@/components/admin-settings-page';

export const metadata: Metadata = {
  title: 'Admin | Configuracion',
  description: 'Configuracion operativa del flujo de ordenes y marketplace.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminSettingsRoutePage() {
  return <AdminSettingsPage />;
}
