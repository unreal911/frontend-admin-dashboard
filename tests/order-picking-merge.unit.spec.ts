import { test, expect } from '@playwright/test';
import { normalizeOrderPickingResponse, normalizeOrderDetailResponse } from '../lib/admin-order-types';

// El panel de reservas usa como verdad `reservedQuantity` del merge picking+detalle.
// Tras el fix backend, la respuesta de picking expone el reserved REAL por linea, y el
// merge lo conserva. Asi una linea llena en BD (Negro L 904 = 5/5) NO se pinta como
// "Pendiente 0/5" (que era lo que provocaba el error al pulsar +).

test.describe('normalizeOrderPickingResponse — surfacea el reserved real por linea', () => {
  const detailPayload = {
    id: 1,
    code: 'MK-1',
    status: 'CONFIRMED',
    items: [
      { id: 904, variantId: 10, quantity: 5, reserved: 5, reservedQuantity: 5 },
    ],
  };

  // Picking ahora devuelve el reserved real (5), no el reparto voraz (0).
  const pickingPayload = {
    orderId: 1,
    orderCode: 'MK-1',
    orderStatus: 'CONFIRMED',
    items: [
      { orderItemId: 904, pickingItemId: 55, variantId: 10, requestedQuantity: 5, reservedQuantity: 5 },
    ],
  };

  test('tras el merge, la linea llena conserva reserved=5 (no aparece como pendiente)', () => {
    const detail = normalizeOrderDetailResponse(detailPayload);
    const merged = normalizeOrderPickingResponse(pickingPayload, detail);
    const line = merged?.items.find((it) => (it.orderItemId || it.id) === 904);

    expect(line?.reservedQuantity).toBe(5);
  });
});
