import { expect, Page, test } from '@playwright/test';

type MockState = {
  status: 'RETURN_PENDING' | 'CANCELLED';
  statusPatchCount: number;
  lastStatusPayload: unknown;
};

async function setAdminSession(page: Page) {
  await page.context().addCookies([
    {
      name: 'admin_session',
      value: 'e2e-admin-session',
      url: 'http://127.0.0.1:3000',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

function buildReturnOrder(state: MockState) {
  const isReturnPending = state.status === 'RETURN_PENDING';

  return {
    id: 77,
    code: 'ORD-RETURN-0077',
    status: state.status,
    salesChannel: 'POS',
    total: 36,
    subtotal: 30.51,
    igvAmount: 5.49,
    applyIgv: true,
    clientName: 'Cliente Devolucion',
    clientEmail: 'devolucion@example.com',
    clientPhone: '999999999',
    note: 'Metodo de pago: Efectivo | Ref: QA-RETURN | Monto recibido: 50.00 | Vuelto: 14.00',
    sourceStore: { id: 1, name: 'Tienda Central' },
    fulfillmentStore: { id: 1, name: 'Tienda Central' },
    primaryResponsible: { id: 101, firstName: 'Admin', lastName: 'QA' },
    sellerUser: null,
    pickerUser: null,
    dispenserUser: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:05:00.000Z',
    pickingSummary: null,
    pickingSession: null,
    pickingResponsibility: null,
    returnWorkflow: isReturnPending
      ? {
        requestedAt: '2026-06-01T10:02:00.000Z',
        acceptedAt: '2026-06-01T10:03:00.000Z',
        acceptanceStatus: 'ACCEPTED',
        cancelledBy: { id: 101, firstName: 'Admin', lastName: 'QA' },
        responsible: { id: 101, firstName: 'Admin', lastName: 'QA' },
        delegatedBy: null,
      }
      : null,
    items: [
      {
        id: 501,
        variantId: 7001,
        quantity: 2,
        requestedQuantity: 2,
        pickedQuantity: isReturnPending ? 2 : 0,
        picked: isReturnPending ? 2 : 0,
        reservedQuantity: 2,
        maxPickableQuantity: 2,
        unitPrice: 18,
        subtotal: 36,
        status: isReturnPending ? 'COMPLETED' : 'PENDING',
        variant: {
          id: 7001,
          sku: 'SKU-RETURN-NEGRO-L',
          price: 18,
          productName: 'Polo Retorno QA',
          colorName: 'Negro',
          sizeName: 'L',
        },
      },
    ],
    reservations: [
      {
        id: 301,
        quantity: 2,
        status: isReturnPending ? 'ACTIVE' : 'RELEASED',
        variantId: 7001,
        inventoryId: 901,
        createdAt: '2026-06-01T10:00:00.000Z',
        inventory: {
          id: 901,
          storeId: 1,
          store: { id: 1, name: 'Tienda Central' },
          variant: { id: 7001, sku: 'SKU-RETURN-NEGRO-L' },
        },
      },
    ],
  };
}

async function setupReturnMockApi(page: Page, state: MockState) {
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
        },
      });
    }

    if (path === '/api/admin/system-config/order-workflow' && method === 'GET') {
      return fulfillJson({
        data: {
          returnResponsibilityManagementEnabled: true,
          pickingResponsibilityFlowEnabled: false,
        },
      });
    }

    if (path === '/api/admin/orders' && method === 'GET') {
      return fulfillJson({
        data: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 1 },
      });
    }

    if (path === '/api/admin/orders/77' && method === 'GET') {
      return fulfillJson({ data: buildReturnOrder(state) });
    }

    if (path === '/api/admin/orders/77/picking' && method === 'GET') {
      return fulfillJson({ data: null });
    }

    if (path === '/api/admin/orders/77/status' && method === 'PATCH') {
      state.statusPatchCount += 1;
      state.lastStatusPayload = request.postDataJSON();
      state.status = 'CANCELLED';
      return fulfillJson({ data: buildReturnOrder(state) });
    }

    return fulfillJson({ data: null });
  });
}

test('confirma devolucion desde detalle y muestra datos de pago POS', async ({ page }) => {
  const state: MockState = {
    status: 'RETURN_PENDING',
    statusPatchCount: 0,
    lastStatusPayload: null,
  };
  await setAdminSession(page);
  await setupReturnMockApi(page, state);

  await page.goto('/admin/orders/77');

  await expect(page.getByRole('heading', { name: 'ORD-RETURN-0077' })).toBeVisible();
  await expect(page.getByText('Devolucion de inventario pendiente:')).toBeVisible();
  await expect(page.getByText('S/ 50.00')).toBeVisible();
  await expect(page.getByText('S/ 14.00')).toBeVisible();
  await expect(page.getByText('2 unidades')).toBeVisible();

  await page.getByRole('button', { name: 'Confirmar devolucion' }).click();
  await expect(page.getByRole('dialog', { name: 'Confirmar devolucion' })).toBeVisible();
  await expect.poll(() => state.statusPatchCount).toBe(0);

  await page.getByRole('button', { name: 'Confirmar' }).click();

  await expect.poll(() => state.statusPatchCount).toBe(1);
  expect(state.lastStatusPayload).toMatchObject({
    status: 'CANCELLED',
    note: 'Devolucion de stock completada',
  });
  await expect(page.getByText('Devolucion confirmada y cancelacion finalizada.')).toBeVisible();
});
