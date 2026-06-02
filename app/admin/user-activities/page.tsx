import type { Metadata } from 'next';
import { AdminUserActivitiesPage } from '@/components/admin-user-activities-page';

export const metadata: Metadata = {
  title: 'Admin | Actividades',
  description: 'Bitacora funcional de acciones realizadas por los usuarios del sistema.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminUserActivitiesRoutePage() {
  return <AdminUserActivitiesPage />;
}
