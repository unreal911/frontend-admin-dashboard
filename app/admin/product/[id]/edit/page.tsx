import type { Metadata } from 'next';
import { AdminProductEditPage } from '@/components/admin-product-edit-page';

interface AdminProductEditRoutePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: AdminProductEditRoutePageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Admin | Editar producto #${id}`,
    description: `Edicion del producto #${id}.`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function AdminProductEditRoutePage({ params }: AdminProductEditRoutePageProps) {
  const { id } = await params;
  const productId = Number(id);

  if (!Number.isInteger(productId) || productId < 1) {
    return (
      <section className="admin-dashboard-grid">
        <article className="admin-card">
          <h1>Producto invalido</h1>
          <p>El identificador de producto no es valido.</p>
        </article>
      </section>
    );
  }

  return <AdminProductEditPage productId={productId} />;
}
