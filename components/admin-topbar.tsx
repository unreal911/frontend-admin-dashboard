'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { useAdminShell } from '@/components/admin-shell-provider';

export function AdminTopbar() {
  const router = useRouter();
  const { user } = useAdminAuth();
  const {
    theme,
    isMobile,
    pendingAssignments,
    loadingNotifications,
    toggleTheme,
    toggleSidebar,
  } = useAdminShell();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setNotificationsOpen(false);
      }
    }

    function onClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.admin-notifications-next')) {
        setNotificationsOpen(false);
      }
    }

    window.addEventListener('keydown', onEscape);
    window.addEventListener('click', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onEscape);
      window.removeEventListener('click', onClickOutside);
    };
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch('/api/admin/session', { method: 'DELETE' });
    } finally {
      router.push('/login');
      router.refresh();
      setIsLoggingOut(false);
    }
  }

  function openAssignment(orderId: number) {
    setNotificationsOpen(false);
    router.push(`/admin/orders/${orderId}`);
  }

  return (
    <header className="admin-topbar">
      <div className="admin-topbar-left-next">
        <button
          type="button"
          className="admin-drawer-toggle-next"
          aria-label={isMobile ? 'Abrir menu lateral' : 'Colapsar menu lateral'}
          onClick={toggleSidebar}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z" />
            <path d="M9 4v16" />
            <path d="M14 10l2 2l-2 2" />
          </svg>
        </button>
        <div className="admin-navbar-title-next">Panel de Administracion</div>
      </div>
      <div className="admin-topbar-actions">
        {user ? (
          <div className="admin-active-tenant-next" title={`Empresa activa: ${user.tenant.name}`}>
            <span>Empresa activa</span>
            <strong>{user.tenant.name}</strong>
          </div>
        ) : null}
        <div className="admin-notifications-next">
          <button
            type="button"
            className="admin-notification-button-next"
            aria-label="Notificaciones de tareas pendientes"
            title="Tareas pendientes"
            onClick={(event) => {
              event.stopPropagation();
              setNotificationsOpen((current) => !current);
            }}
          >
            <span className="admin-notification-bell-next" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m2 0v1a1 1 0 0 0 2 0v-1m-2 0h2" />
              </svg>
            </span>
            {pendingAssignments.length > 0 ? (
              <span className="admin-notification-count-next">{pendingAssignments.length}</span>
            ) : null}
          </button>

          {notificationsOpen ? (
            <div className="admin-notification-panel-next">
              <div className="admin-notification-panel-head-next">
                <strong>Pendientes asignados</strong>
                <button type="button" className="admin-ghost-btn admin-notification-close-next" onClick={() => setNotificationsOpen(false)}>
                  Cerrar
                </button>
              </div>
              {loadingNotifications ? (
                <p className="admin-notification-empty-next">Cargando notificaciones...</p>
              ) : pendingAssignments.length === 0 ? (
                <p className="admin-notification-empty-next">No tienes tareas pendientes asignadas.</p>
              ) : (
                <div className="admin-notification-list-next">
                  {pendingAssignments.map((assignment) => (
                    <button
                      key={assignment.orderId}
                      type="button"
                      className="admin-notification-item-next"
                      onClick={() => openAssignment(assignment.orderId)}
                    >
                      <span className="admin-notification-item-title-next">{assignment.title}</span>
                      <span className="admin-notification-item-detail-next">{assignment.orderCode} - {assignment.detail}</span>
                      <span className="admin-notification-item-status-next">
                        {assignment.acceptanceStatus === 'PENDING' ? 'Por aceptar' : 'En proceso'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {user ? (
          <div className="admin-topbar-user-next">
            <strong>{`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email}</strong>
            <span className="admin-topbar-role-badge-next">{user.role}</span>
          </div>
        ) : null}

        <button
          type="button"
          className="theme-toggle-next"
          aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          title={theme === 'dark' ? 'Tema oscuro' : 'Tema claro'}
          onClick={toggleTheme}
        >
          <span className="theme-toggle-track-next">
            <span className="theme-toggle-thumb-next">{theme === 'dark' ? 'Oscuro' : 'Claro'}</span>
          </span>
        </button>
        <button type="button" className="admin-ghost-btn admin-navbar-logout-next" onClick={handleLogout} disabled={isLoggingOut}>
          {isLoggingOut ? 'Cerrando...' : 'Cerrar Sesion'}
        </button>
      </div>
    </header>
  );
}
