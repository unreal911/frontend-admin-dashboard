import type { Metadata } from 'next';
import { AdminPaymentMethodPage } from '@/components/admin-payment-method-page';

export const metadata: Metadata = {
  title: 'Admin | Metodos de pago',
  description: 'Gestion de metodos de pago del sistema.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPaymentMethodsRoutePage() {
  return <AdminPaymentMethodPage />;
}
