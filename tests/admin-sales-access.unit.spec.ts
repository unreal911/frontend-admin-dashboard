import { expect, test } from '@playwright/test';
import { ADMIN_ROUTE_ITEMS } from '../lib/admin-routes';
import {
  canAccessDispatchSection,
  canAccessPickingSection,
  resolveOrdersHubView,
} from '../lib/admin-sales-access';

test.describe('Ventas y atencion — permisos y limites por plan', () => {
  test('concentra preparación y despacho dentro de Pedidos', () => {
    const salesRoutes = ADMIN_ROUTE_ITEMS.filter((item) => item.group === 'Ventas');

    expect(salesRoutes.some((item) => item.slug === 'picking')).toBe(false);
    expect(salesRoutes.some((item) => item.slug === 'dispatch')).toBe(false);
    const ordersRoute = salesRoutes.find((item) => item.slug === 'orders/list');
    expect(ordersRoute).toMatchObject({
      label: 'Pedidos',
      permission: 'orders.view',
    });
    expect(ordersRoute).not.toHaveProperty('feature');
    expect(salesRoutes.find((item) => item.slug === 'tasks')).toMatchObject({
      permission: 'tasks.view.own',
      feature: 'tasks.operational',
    });
  });

  test('permite Preparación solamente si coinciden plan y permiso RBAC', () => {
    expect(canAccessPickingSection({
      hasPickingFeature: true,
      hasPickingPermission: true,
    })).toBe(true);
    expect(resolveOrdersHubView('preparation', {
      hasPickingFeature: true,
      hasPickingPermission: true,
    })).toBe('preparation');
  });

  test('oculta Preparación si falta la capacidad del plan', () => {
    const access = { hasPickingFeature: false, hasPickingPermission: true };
    expect(canAccessPickingSection(access)).toBe(false);
    expect(resolveOrdersHubView('preparation', access)).toBe('orders');
  });

  test('impide entrar por URL si falta el permiso RBAC', () => {
    const access = { hasPickingFeature: true, hasPickingPermission: false };
    expect(canAccessPickingSection(access)).toBe(false);
    expect(resolveOrdersHubView('preparation', access)).toBe('orders');
  });

  test('reserva la bandeja supervisora de despacho para quien puede ver todas las tareas', () => {
    const supervisor = {
      hasPickingFeature: true,
      hasPickingPermission: true,
      hasTasksFeature: true,
      hasTasksViewAllPermission: true,
    };
    expect(canAccessDispatchSection(supervisor)).toBe(true);
    expect(resolveOrdersHubView('dispatch', supervisor)).toBe('dispatch');
    expect(resolveOrdersHubView('dispatch', { ...supervisor, hasTasksViewAllPermission: false })).toBe('orders');
    expect(resolveOrdersHubView('dispatch', { ...supervisor, hasTasksFeature: false })).toBe('orders');
  });
});
