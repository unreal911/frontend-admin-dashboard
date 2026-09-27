'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminOrdersListPage } from '@/components/admin-orders-list-page';
import { AdminPickingBoardPage } from '@/components/admin-picking-board-page';
import { AdminDispatchBoardPage } from '@/components/admin-dispatch-board-page';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { canAccessDispatchSection, canAccessPickingSection, resolveOrdersHubView } from '@/lib/admin-sales-access';

export function AdminOrdersHubPage() {
  const searchParams = useSearchParams();
  const { hasFeature, hasPermission } = useAdminAuth();
  const pickingAccess = {
    hasPickingFeature: hasFeature('picking.basic'),
    hasPickingPermission: hasPermission('picking.view'),
    hasTasksFeature: hasFeature('tasks.operational'),
    hasTasksViewAllPermission: hasPermission('tasks.view.all'),
  };
  const preparationEnabled = canAccessPickingSection(pickingAccess);
  const dispatchEnabled = canAccessDispatchSection(pickingAccess);
  const requestedView = searchParams.get('view');
  const view = resolveOrdersHubView(requestedView, pickingAccess);

  return (
    <>
      <nav className="admin-card admin-table-actions" aria-label="Vistas de pedidos">
        <Link className={view === 'orders' ? 'admin-primary-btn' : 'admin-ghost-btn'} href="/admin/orders/list">
          Todos los pedidos
        </Link>
        {preparationEnabled ? (
          <Link
            className={view === 'preparation' ? 'admin-primary-btn' : 'admin-ghost-btn'}
            href="/admin/orders/list?view=preparation"
          >
            Preparacion
          </Link>
        ) : null}
        {dispatchEnabled ? (
          <Link
            className={view === 'dispatch' ? 'admin-primary-btn' : 'admin-ghost-btn'}
            href="/admin/orders/list?view=dispatch"
          >
            Empaque y despacho
          </Link>
        ) : null}
      </nav>
      {view === 'preparation'
        ? <AdminPickingBoardPage />
        : view === 'dispatch'
          ? <AdminDispatchBoardPage />
          : <AdminOrdersListPage />}
    </>
  );
}
