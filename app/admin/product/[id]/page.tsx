import type { Metadata } from 'next';
import { AdminProductDetailPage } from '@/components/admin-product-detail-page';

interface AdminProductDetailRoutePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: AdminProductDetailRoutePageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Admin | Detalle producto #${id}`,
    description: `Administracion de variantes del producto #${id}.`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function AdminProductDetailRoutePage({ params }: AdminProductDetailRoutePageProps) {
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

  return <AdminProductDetailPage productId={productId} />;
}
