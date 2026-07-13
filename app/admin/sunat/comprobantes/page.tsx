import type { Metadata } from 'next';
import { AdminSunatComprobantesPage } from '@/components/admin-sunat-comprobantes';

export const metadata: Metadata = {
  title: 'Admin | Comprobantes SUNAT',
  description: 'Consulta de comprobantes electronicos, notas de credito/debito y anulaciones.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminSunatComprobantesRoutePage() {
  return <AdminSunatComprobantesPage />;
}
