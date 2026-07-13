import type { Metadata } from 'next';
import { AdminSunatConfig } from '@/components/admin-sunat-config';

export const metadata: Metadata = {
  title: 'Admin | Emisor SUNAT',
  description: 'Configuracion del emisor SUNAT: datos, credenciales Clave SOL y certificado digital.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminSunatConfigRoutePage() {
  return <AdminSunatConfig />;
}
