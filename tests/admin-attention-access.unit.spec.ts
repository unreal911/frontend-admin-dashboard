import { expect, test } from '@playwright/test';
import { ADMIN_ROUTE_ITEMS } from '../lib/admin-routes';

test('la bandeja de atención exige capacidad del plan y permiso RBAC', () => {
  const route = ADMIN_ROUTE_ITEMS.find((item) => item.slug === 'attention');
  expect(route).toMatchObject({
    group: 'Ventas',
    permission: 'attention.view',
    feature: 'attention.inbox',
  });
});
