import type { Metadata } from 'next';
import { AdminCompanyLifecyclePage } from '@/components/admin-company-lifecycle-page';

export const metadata: Metadata = { title: 'Empresa y plan' };

export default function Page() {
  return <AdminCompanyLifecyclePage />;
}
