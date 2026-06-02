import type { Metadata } from 'next';
import { ADMIN_ROUTE_ITEMS, buildAdminPath, normalizeAdminSlug, resolveAdminRoute } from '@/lib/admin-routes';

interface AdminPageProps {
  params: Promise<{ slug: string[] }>;
}

function buildOrderDetailRoute(slug: string) {
  const parts = slug.split('/').filter(Boolean);
  if (parts.length === 2 && parts[0] === 'orders' && !['list', 'pos', 'picking'].includes(parts[1])) {
    return {
      slug,
      label: `Pedido #${parts[1]}`,
      permission: 'orders.detail.view',
      description: 'Detalle de pedido (ruta dinamica).',
    };
  }
  return null;
}

export async function generateMetadata({ params }: AdminPageProps): Promise<Metadata> {
  const { slug: slugParts } = await params;
  const slug = normalizeAdminSlug(slugParts);
  const route = resolveAdminRoute(slugParts) || buildOrderDetailRoute(slug);

  if (!route) {
    return {
      title: 'Admin | Ruta no implementada',
      description: 'La ruta solicitada no esta disponible en este panel.',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Admin | ${route.label}`,
    description: route.description,
    robots: { index: false, follow: false },
  };
}

export default async function AdminModulePage({ params }: AdminPageProps) {
  const { slug: slugParts } = await params;
  const slug = normalizeAdminSlug(slugParts);
  const route = resolveAdminRoute(slugParts) || buildOrderDetailRoute(slug);

  if (!route) {
    return (
      <article className="admin-card">
        <h1>Ruta admin no implementada</h1>
        <p>
          <strong>Slug:</strong> /admin/{slug || '(vacio)'}
        </p>
        <p>Esta ruta no esta disponible por el momento.</p>
      </article>
    );
  }

  const related = ADMIN_ROUTE_ITEMS.filter((item) => item.slug.startsWith(slug.split('/')[0])).slice(0, 6);

  return (
    <article className="admin-card">
      <h1>{route.label}</h1>
      <p>{route.description}</p>
      <p>
        <strong>Ruta:</strong> /admin/{route.slug}
      </p>
      <p>
        <strong>Permiso:</strong> {route.permission || 'N/A'}
      </p>

      <section className="admin-migration-box">
        <h2>Informacion del modulo</h2>
        <p>Esta vista muestra datos base de la ruta mientras se completa su contenido funcional.</p>
      </section>

      {related.length > 0 ? (
        <section className="admin-migration-box">
          <h2>Subrutas relacionadas</h2>
          <ul>
            {related.map((item) => (
              <li key={item.slug}>{buildAdminPath(item.slug)}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
