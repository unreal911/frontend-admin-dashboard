'use client';

import { AdminAccessGate } from '@/components/admin-access-gate';
import { AdminSidebar } from '@/components/admin-sidebar';
import { AdminTopbar } from '@/components/admin-topbar';
import { useAdminShell } from '@/components/admin-shell-provider';

export function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  const { isMobile, isSidebarCollapsed, isSidebarOpen, closeSidebar } = useAdminShell();

  return (
    <section className={`admin-workspace ${isSidebarCollapsed ? 'admin-workspace-sidebar-collapsed' : ''}`}>
      <AdminTopbar />
      <section className="admin-shell">
        <AdminSidebar />
        <div className="admin-content">
          <div className="admin-content-inner-next">
            <AdminAccessGate>{children}</AdminAccessGate>
          </div>
        </div>
      </section>
      {isMobile && isSidebarOpen ? (
        <button
          type="button"
          className="admin-drawer-overlay-next"
          aria-label="Cerrar menu lateral"
          onClick={closeSidebar}
        />
      ) : null}
    </section>
  );
}
