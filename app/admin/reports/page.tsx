import type { Metadata } from 'next';
import { AdminReportBuilderPage } from '@/components/admin-report-builder-page';

export const metadata: Metadata = {
  title: 'Admin | Reportes personalizados',
  description: 'Constructor visual de reportes y exportacion a Excel.',
  robots: { index: false, follow: false },
};

export default function AdminReportsRoutePage() {
  return <AdminReportBuilderPage />;
}
