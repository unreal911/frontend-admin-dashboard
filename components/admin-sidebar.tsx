'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { useAdminShell } from '@/components/admin-shell-provider';
import {
  ADMIN_ROUTE_GROUP_ORDER,
  ADMIN_ROUTE_GROUP_LABELS,
  AdminRouteGroup,
  AdminRouteItem,
  buildAdminPath,
  listAdminRoutesByGroup,
} from '@/lib/admin-routes';

function routeIcon(route: AdminRouteItem) {
  const slug = route.slug;

  if (slug === 'dashboard') {
    return (
      <>
        <path d="M3 3h18v18H3z" />
        <path d="M9 9h2v8H9z" />
        <path d="M13 5h2v12h-2z" />
        <path d="M17 11h2v6h-2z" />
      </>
    );
  }
  if (slug === 'reports') {
    return (
      <>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20H2" />
      </>
    );
  }
  if (slug === 'manual') {
    return (
      <>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11a2 2 0 0 1 2 2v16a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 21.5z" />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v18a2 2 0 0 1 2-2h2.5a2.5 2.5 0 0 1 2.5 2.5z" />
      </>
    );
  }
  if (slug === 'category') {
    return (
      <>
        <path d="M12 2h-7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7" />
        <path d="M12 2v18" />
        <path d="M2 8h18" />
        <path d="M6 8v12" />
        <path d="M18 8v12" />
      </>
    );
  }
  if (slug === 'color' || slug === 'size') {
    return (
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" fill="currentColor" opacity="0.3" />
      </>
    );
  }
  if (slug === 'payment-methods') {
    return (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h3" />
      </>
    );
  }
  if (slug === 'product') {
    return (
      <>
        <path d="M4 6h16v12H4z" />
        <path d="M4 10h16" />
      </>
    );
  }
  if (slug === 'stores') {
    return (
      <>
        <path d="M3 9l9-6 9 6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
        <path d="M9 22V12h6v10" />
      </>
    );
  }
  if (slug.startsWith('inventory')) {
    return (
      <>
        <path d="M4 4h16v16H4z" />
        <path d="M8 4v16" />
        <path d="M16 4v16" />
      </>
    );
  }
  if (slug === 'transfers') {
    return (
      <>
        <path d="M7 7h11" />
        <path d="M7 17h11" />
        <path d="M4 7l3-3" />
        <path d="M4 7l3 3" />
        <path d="M20 17l-3-3" />
        <path d="M20 17l-3 3" />
      </>
    );
  }
  if (slug === 'orders/pos') {
    return <path d="M4 7h16 M4 12h16 M4 17h16" />;
  }
  if (slug === 'orders/picking') {
    return <path d="M9 3H5a2 2 0 0 0-2 2v4h18V5a2 2 0 0 0-2-2h-4 M12 3V2a1 1 0 0 0-1-1h2a1 1 0 0 0-1 1v1 M6 7h12" />;
  }
  if (slug === 'orders/list' || slug.startsWith('orders/')) {
    return <path d="M9 6h11 M9 12h11 M9 18h11 M3 6h.01 M3 12h.01 M3 18h.01" />;
  }
  if (slug.startsWith('sunat')) {
    return (
      <>
        <path d="M6 2h9l3 3v17l-2-1-2 1-2-1-2 1-2-1-2 1V2z" />
        <path d="M9 7h6" />
        <path d="M9 11h6" />
        <path d="M9 15h4" />
      </>
    );
  }
  if (slug === 'users') {
    return <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8a4 4 0 1 0 0 8" />;
  }
  if (slug === 'roles') {
    return <path d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4 M3 21a9 9 0 0 1 18 0" />;
  }
  if (slug === 'settings' || slug === 'audit-logs' || slug === 'user-activities') {
    return <path d="M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05a2 2 0 0 1 0 2.83a2 2 0 0 1-2.83 0l-.05-.05a1.7 1.7 0 0 0-1.87-.34a1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.08a1.7 1.7 0 0 0-1-1.55a1.7 1.7 0 0 0-1.87.34l-.05.05a2 2 0 0 1-2.83 0a2 2 0 0 1 0-2.83l.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.08a1.7 1.7 0 0 0 1.55-1a1.7 1.7 0 0 0-.34-1.87l-.05-.05a2 2 0 0 1 0-2.83a2 2 0 0 1 2.83 0l.05.05a1.7 1.7 0 0 0 1.87.34a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.08a1.7 1.7 0 0 0 1 1.55a1.7 1.7 0 0 0 1.87-.34l.05-.05a2 2 0 0 1 2.83 0a2 2 0 0 1 0 2.83l-.05.05a1.7 1.7 0 0 0-.34 1.87a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.08a1.7 1.7 0 0 0-1.55 1" />;
  }

  return <path d="M4 12h16" />;
}

function isRouteActive(pathname: string, item: AdminRouteItem, href: string): boolean {
  if (pathname === href) return true;
  return item.slug === 'orders/list' && /^\/admin\/orders\/\d+$/.test(pathname);
}

export function AdminSidebar() {
  const pathname = usePathname();
  const { hasPermission, hasFeature, user } = useAdminAuth();
  const membershipRole = user?.membership.role;
  const {
    isMobile,
    isSidebarOpen,
    isSidebarCollapsed,
    closeSidebar,
  } = useAdminShell();

  const groupedRoutes = useMemo(() => ADMIN_ROUTE_GROUP_ORDER
    .map((group) => ({
      group,
      routes: listAdminRoutesByGroup(group).filter((item) => (
        hasPermission(item.permission)
        && hasFeature(item.feature)
        && (!item.ownerOnly || membershipRole === 'OWNER')
      )),
    }))
    .filter((section) => section.routes.length > 0), [hasFeature, hasPermission, membershipRole]);

  const activeGroup = useMemo<AdminRouteGroup>(() => {
    const section = groupedRoutes.find(({ routes }) => routes.some((item) => isRouteActive(pathname, item, buildAdminPath(item.slug))));
    return section?.group || 'General';
  }, [groupedRoutes, pathname]);

  const [expandedGroups, setExpandedGroups] = useState<AdminRouteGroup[]>(['General']);

  useEffect(() => {
    setExpandedGroups((current) => current.includes(activeGroup) ? current : [...current, activeGroup]);
  }, [activeGroup]);

  function toggleGroup(group: AdminRouteGroup) {
    setExpandedGroups((current) => current.includes(group)
      ? current.filter((item) => item !== group)
      : [...current, group]);
  }

  return (
    <aside
      className={[
        'admin-sidebar',
        isMobile ? 'admin-sidebar-mobile-next' : '',
        isMobile && isSidebarOpen ? 'open' : '',
        !isMobile && isSidebarCollapsed ? 'collapsed' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="admin-sidebar-mobile-head-next">
        <div><strong>Menu principal</strong><span>Navega por secciones</span></div>
        <button type="button" onClick={closeSidebar} aria-label="Cerrar menu lateral">&times;</button>
      </div>
      <nav className="admin-sidebar-groups" aria-label="Menu de administracion">
        {groupedRoutes.map(({ group, routes }) => {
          const expanded = (!isMobile && isSidebarCollapsed) || expandedGroups.includes(group);
          return <section className={`admin-sidebar-group ${activeGroup === group ? 'has-active' : ''}`} key={group}>
            <h3>
              <button
                type="button"
                className="admin-sidebar-group-toggle-next"
                aria-label={`Seccion ${ADMIN_ROUTE_GROUP_LABELS[group]}`}
                title={ADMIN_ROUTE_GROUP_LABELS[group]}
                aria-expanded={expanded}
                aria-controls={`admin-sidebar-group-${group.toLowerCase()}`}
                onClick={() => toggleGroup(group)}
              >
                <span>{ADMIN_ROUTE_GROUP_LABELS[group]}</span>
                <small>{routes.length}</small>
                <i aria-hidden="true">⌄</i>
              </button>
            </h3>
            <div id={`admin-sidebar-group-${group.toLowerCase()}`} className="admin-sidebar-nav-next" hidden={!expanded}>
              {routes.map((item) => {
                const href = buildAdminPath(item.slug);
                const active = isRouteActive(pathname, item, href);
                return <Link
                  key={item.slug}
                  href={href}
                  title={item.description}
                  aria-current={active ? 'page' : undefined}
                  className={active ? 'active' : ''}
                  onClick={(event) => {
                    event.currentTarget.blur();
                    if (isMobile) closeSidebar();
                  }}
                >
                  <span className="admin-sidebar-icon-next" aria-hidden="true">
                    <svg viewBox="0 0 24 24">{routeIcon(item)}</svg>
                  </span>
                  <span className="admin-sidebar-label-next">{item.label}</span>
                </Link>;
              })}
            </div>
          </section>;
        })}
      </nav>
    </aside>
  );
}
