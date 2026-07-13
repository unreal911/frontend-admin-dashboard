import type { Metadata } from 'next';
import { AdminSunatPage } from '@/components/admin-sunat-page';

export const metadata: Metadata = {
  title: 'Admin | SUNAT',
  description: 'Facturacion electronica: declaracion de boletas y comprobantes a SUNAT.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminSunatRoutePage() {
  return <AdminSunatPage />;
}
