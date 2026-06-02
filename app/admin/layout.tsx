import { AdminAuthProvider } from '@/components/admin-auth-provider';
import { AdminLayoutShell } from '@/components/admin-layout-shell';
import { AdminShellProvider } from '@/components/admin-shell-provider';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminAuthProvider>
      <AdminShellProvider>
        <AdminLayoutShell>{children}</AdminLayoutShell>
      </AdminShellProvider>
    </AdminAuthProvider>
  );
}
