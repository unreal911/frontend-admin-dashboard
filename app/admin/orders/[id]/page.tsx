import type { Metadata } from 'next';
import { AdminOrderDetailPage } from '@/components/admin-order-detail-page';

interface AdminOrderDetailRoutePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: AdminOrderDetailRoutePageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Admin | Pedido #${id}`,
    description: `Detalle del pedido #${id}.`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function AdminOrderDetailRoutePage({ params }: AdminOrderDetailRoutePageProps) {
  const { id } = await params;
  const orderId = Number(id);

  if (!Number.isInteger(orderId) || orderId < 1) {
    return (
      <section className="admin-dashboard-grid">
        <article className="admin-card">
          <h1>Pedido invalido</h1>
          <p>El identificador de pedido no es valido.</p>
        </article>
      </section>
    );
  }

  return <AdminOrderDetailPage orderId={orderId} />;
}
