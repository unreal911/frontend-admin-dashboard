'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useAdminAuth } from '@/components/admin-auth-provider';
import {
  ADMIN_ROUTE_ITEMS,
  buildAdminPath,
  normalizeAdminSlug,
  resolveAdminRoute,
} from '@/lib/admin-routes';

function resolveRequiredPermission(pathname: string): string | null {
  const slugParts = pathname
    .replace(/^\/admin\/?/, '')
    .split('/')
    .filter(Boolean);
  const slug = normalizeAdminSlug(slugParts);

  const staticRoute = resolveAdminRoute(slugParts);
  if (staticRoute?.permission) {
    return staticRoute.permission;
  }

  if (slugParts.length === 2 && slugParts[0] === 'orders' && !['list', 'pos', 'picking'].includes(slugParts[1])) {
    return 'orders.detail.view';
  }

  if (!slug || slug === 'dashboard') {
    return 'dashboard.view';
  }

  return null;
}

export function AdminAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/admin/dashboard';
  const router = useRouter();
  const { loading, user, hasPermission } = useAdminAuth();

  const requiredPermission = useMemo(() => resolveRequiredPermission(pathname), [pathname]);
  const allowed = hasPermission(requiredPermission);

  const allowedRoutes = useMemo(() => {
    return ADMIN_ROUTE_ITEMS.filter((item) => hasPermission(item.permission)).slice(0, 8);
  }, [hasPermission]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, router, user]);

  if (loading) {
    return (
      <article className="admin-card">
        <h1>Validando sesion...</h1>
        <p className="admin-muted-text">Estamos verificando tus permisos de acceso.</p>
      </article>
    );
  }

  if (!user) {
    return (
      <article className="admin-card">
        <h1>Redirigiendo a login</h1>
        <p className="admin-muted-text">Tu sesion no esta activa.</p>
      </article>
    );
  }

  if (requiredPermission && !allowed) {
    return (
      <article className="admin-card admin-no-access-next">
        <h1>Acceso denegado</h1>
        <p>No tienes permiso para acceder a esta seccion.</p>
        <p className="admin-muted-text">
          Permiso requerido: <strong>{requiredPermission}</strong>
        </p>
        {allowedRoutes.length > 0 ? (
          <>
            <p className="admin-muted-text">Secciones disponibles para tu perfil:</p>
            <div className="admin-link-grid">
              {allowedRoutes.map((route) => (
                <Link key={route.slug} href={buildAdminPath(route.slug)} className="admin-link-card">
                  <strong>{route.label}</strong>
                  <span>{route.description}</span>
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </article>
    );
  }

  return <>{children}</>;
}

