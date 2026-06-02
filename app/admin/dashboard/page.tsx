import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ADMIN_ROUTE_GROUP_ORDER,
  buildAdminPath,
  listAdminRoutesByGroup,
} from '@/lib/admin-routes';

export const metadata: Metadata = {
  title: 'Admin | Dashboard',
  description: 'Resumen de modulos y accesos del panel administrativo.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminDashboardPage() {
  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card">
        <h1>Dashboard</h1>
        <p>
          Accede rapidamente a cada modulo del panel y sus herramientas de gestion.
        </p>
      </article>

      {ADMIN_ROUTE_GROUP_ORDER.map((group) => {
        const routes = listAdminRoutesByGroup(group);
        if (routes.length === 0) {
          return null;
        }

        return (
          <article key={group} className="admin-card">
            <h2>{group}</h2>
            <p>{routes.length} modulo(s) disponibles.</p>
            <div className="admin-link-grid">
              {routes.map((route) => (
                <Link key={route.slug} href={buildAdminPath(route.slug)} className="admin-link-card">
                  <strong>{route.label}</strong>
                  <span>{route.description}</span>
                </Link>
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}
