import { expect, Page, test } from '@playwright/test';

type MockState = {
  pickedQuantity: number;
  lastPatchPath: string;
};

async function setAdminSession(page: Page) {
  await page.context().addCookies([
    {
      name: 'admin_session',
      value: 'e2e-admin-session',
      url: 'http://127.0.0.1:3001',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

function buildOrderItem(pickedQuantity: number) {
  const normalizedPicked = Math.max(0, Math.min(4, Number(pickedQuantity || 0)));
  return {
    id: 9001,
    pickingItemId: 5001,
    variantId: 7001,
    quantity: 4,
    requestedQuantity: 4,
    reservedQuantity: 4,
    maxPickableQuantity: 4,
    pickedQuantity: normalizedPicked,
    missingQuantity: Math.max(0, 4 - normalizedPicked),
    status: normalizedPicked >= 4 ? 'COMPLETED' : (normalizedPicked > 0 ? 'PARTIAL' : 'PENDING'),
    variant: {
      id: 7001,
      sku: 'SKU-POLO-NEGRO-M',
      price: 18,
      productName: 'Polo Test Operativo',
      colorName: 'Negro',
      sizeName: 'M',
    },
  };
}

function buildOrderRecord(pickedQuantity: number) {
  const item = buildOrderItem(pickedQuantity);
  return {
    id: 1,
    code: 'ORD-0001',
    status: 'PREPARING',
    salesChannel: 'POS',
    total: 72,
    subtotal: 61.02,
    igvAmount: 10.98,
    applyIgv: true,
    clientName: 'Cliente QA',
    clientEmail: 'qa@example.com',
    clientPhone: '999999999',
    note: 'Metodo de pago: Efectivo | Ref: QA-001',
    sourceStore: { id: 1, name: 'Tienda Central' },
    fulfillmentStore: { id: 1, name: 'Tienda Central' },
    primaryResponsible: { id: 101, firstName: 'Admin', lastName: 'QA' },
    createdAt: '2026-05-30T10:00:00.000Z',
    updatedAt: '2026-05-30T10:05:00.000Z',
    pickingSummary: {
      totalRequested: 4,
      totalPicked: Math.max(0, Math.min(4, Number(pickedQuantity || 0))),
      progress: Math.round((Math.max(0, Math.min(4, Number(pickedQuantity || 0))) / 4) * 100),
      completed: Number(pickedQuantity || 0) >= 4,
    },
    pickingSession: {
      id: 801,
      status: 'IN_PROGRESS',
      assignedUser: { id: 101, firstName: 'Admin', lastName: 'QA' },
      createdAt: '2026-05-30T10:00:00.000Z',
      updatedAt: '2026-05-30T10:05:00.000Z',
    },
    pickingResponsibility: {
      enabled: true,
      primaryResponsible: { id: 101, firstName: 'Admin', lastName: 'QA' },
      sharedResponsibles: [],
      pendingRequests: [],
    },
    items: [item],
    reservations: [
      {
        id: 301,
        quantity: 4,
        status: 'ACTIVE',
        variantId: 7001,
        createdAt: '2026-05-30T10:00:00.000Z',
        inventory: {
          id: 901,
          storeName: 'Tienda Central',
          variantSku: 'SKU-POLO-NEGRO-M',
        },
      },
    ],
  };
}

async function setupAdminMockApi(page: Page, state: MockState) {
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = new URL(request.url());
    const path = url.pathname;

    const fulfillJson = (payload: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });

    if (path === '/api/admin/auth/me' && method === 'GET') {
      return fulfillJson({
        user: {
          id: 101,
          firstName: 'Admin',
          lastName: 'QA',
          email: 'admin.qa@example.com',
          role: 'ADMIN',
          permissions: ['*'],
          tenant: {
            id: '00000000-0000-4000-8000-000000000001',
            slug: 'legacy-main',
            name: 'Empresa QA',
            status: 'ACTIVE',
          },
          membership: {
            id: '00000000-0000-4000-8000-000000000101',
            role: 'OWNER',
            status: 'ACTIVE',
          },
        },
      });
    }

    if (path === '/api/admin/system-config/order-workflow' && method === 'GET') {
      return fulfillJson({
        data: {
          returnResponsibilityManagementEnabled: true,
          pickingResponsibilityFlowEnabled: true,
        },
      });
    }

    if (path === '/api/admin/orders' && method === 'GET') {
      const statusFilter = String(url.searchParams.get('status') || '').toUpperCase();
      if (statusFilter === 'RETURN_PENDING') {
        return fulfillJson({
          data: [],
          pagination: { page: 1, limit: 50, total: 0, totalPages: 1 },
        });
      }

      return fulfillJson({
        data: [buildOrderRecord(state.pickedQuantity)],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    }

    if (path === '/api/admin/orders/1' && method === 'GET') {
      return fulfillJson({ data: buildOrderRecord(state.pickedQuantity) });
    }

    if (path === '/api/admin/orders/1/picking' && method === 'GET') {
      return fulfillJson({ data: buildOrderRecord(state.pickedQuantity) });
    }

    if (path === '/api/admin/orders/picking/items/5001' && method === 'PATCH') {
      state.lastPatchPath = path;
      const body = request.postDataJSON() as { pickedQuantity?: unknown } | null;
      const nextPicked = Number(body?.pickedQuantity ?? state.pickedQuantity);
      if (Number.isFinite(nextPicked)) {
        state.pickedQuantity = Math.max(0, Math.min(4, Math.round(nextPicked)));
      }
      return fulfillJson({ data: buildOrderRecord(state.pickedQuantity) });
    }

    if (path === '/api/admin/orders/1/picking/order-items/9001' && method === 'PATCH') {
      state.lastPatchPath = path;
      const body = request.postDataJSON() as { pickedQuantity?: unknown } | null;
      const nextPicked = Number(body?.pickedQuantity ?? state.pickedQuantity);
      if (Number.isFinite(nextPicked)) {
        state.pickedQuantity = Math.max(0, Math.min(4, Math.round(nextPicked)));
      }
      return fulfillJson({ data: buildOrderRecord(state.pickedQuantity) });
    }

    if (path === '/api/admin/orders/1/picking/complete' && method === 'PATCH') {
      state.pickedQuantity = 4;
      return fulfillJson({ data: buildOrderRecord(state.pickedQuantity) });
    }

    if (path === '/api/admin/orders/1/picking/start' && method === 'POST') {
      return fulfillJson({ data: buildOrderRecord(state.pickedQuantity) });
    }

    return fulfillJson({ data: null });
  });
}

test('actualiza picking desde detalle de pedido usando la linea de la orden', async ({ page }) => {
  const state: MockState = { pickedQuantity: 0, lastPatchPath: '' };
  await page.setViewportSize({ width: 1280, height: 900 });
  await setAdminSession(page);
  await setupAdminMockApi(page, state);

  await page.goto('/admin/orders/1');

  await expect(page.getByRole('heading', { name: 'ORD-0001' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Separar (Picking)' })).toBeVisible();

  const pickingCard = page.locator('article.admin-card').filter({ hasText: 'Separar (Picking)' });
  const firstRow = pickingCard.locator('.order-detail-desktop-only-next tbody tr').first();
  const pickedInput = firstRow.getByRole('textbox', { name: 'Cantidad separada' });

  await expect(pickedInput).toHaveValue('0');
  await firstRow.locator('.order-detail-pick-step-next').nth(1).click();

  await expect.poll(() => state.lastPatchPath).toBe('/api/admin/orders/1/picking/order-items/9001');
  await expect(pickedInput).toHaveValue('1');
});

test('muestra cards moviles en productos, picking y reservas', async ({ page }) => {
  const state: MockState = { pickedQuantity: 1, lastPatchPath: '' };
  await page.setViewportSize({ width: 390, height: 844 });
  await setAdminSession(page);
  await setupAdminMockApi(page, state);

  await page.goto('/admin/orders/1');

  // Picking movil usa el layout compacto: una tarjeta por producto con sus
  // variantes en filas (.pk-row) y dos steppers (- / +) por fila.
  const pickingCard = page.locator('article.admin-card').filter({ hasText: 'Separar (Picking)' });
  await expect(pickingCard.locator('.order-detail-mobile-only-next .pk-product')).toHaveCount(1);
  await expect(pickingCard.locator('.order-detail-mobile-only-next .pk-row')).toHaveCount(1);
  await expect(pickingCard.locator('.pk-row-actions .pk-step')).toHaveCount(2);

  await page.getByRole('tab', { name: 'Productos' }).click();
  const productsCard = page.locator('article.admin-card').filter({ hasText: 'Productos de la Orden' });
  await expect(productsCard.locator('.order-detail-mobile-only-next .order-detail-mobile-card-next')).toHaveCount(1);

  await page.getByRole('tab', { name: 'Reservas' }).click();
  const reservationsCard = page.locator('article.admin-card').filter({ hasText: 'Reservas de Stock' });
  await expect(reservationsCard.locator('.order-detail-mobile-only-next .order-detail-mobile-card-next')).toHaveCount(1);
});
