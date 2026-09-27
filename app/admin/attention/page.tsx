import type { Metadata } from 'next';
import { AdminAttentionPage } from '@/components/admin-attention-page';

export const metadata: Metadata = {
  title: 'Admin | Bandeja de atención',
  description: 'Conversaciones y seguimiento de atención al cliente.',
  robots: { index: false, follow: false },
};

export default function AttentionPage() {
  return <AdminAttentionPage />;
}
