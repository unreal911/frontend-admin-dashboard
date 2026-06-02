import type { Metadata } from 'next';
import { AdminAuditLogsPage } from '@/components/admin-audit-logs-page';

export const metadata: Metadata = {
  title: 'Admin | Auditoria',
  description: 'Trazabilidad global de requests procesados en el backend.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminAuditLogsRoutePage() {
  return <AdminAuditLogsPage />;
}
