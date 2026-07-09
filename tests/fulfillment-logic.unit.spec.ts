import { test, expect } from '@playwright/test';
import {
  FulfillmentSuggestion,
  LineInput,
  buildDefaultAssignment,
  canReleaseLine,
  canReserveMore,
  canSplitLine,
  computeStats,
  findSplitCandidate,
  getAssignedQty,
  getDisplayedAssigned,
  getHeaderState,
  getLineState,
  getPending,
  isLineConfigured,
  maxForAssignment,
  nextStepValue,
  resolveVariantSuggestions,
  sortSuggestions,
  storeAvailable,
} from '../lib/fulfillment-logic';

// --- Fixtures -------------------------------------------------------------

function sug(storeId: number, availableStock: number, storeName = `Tienda ${storeId}`): FulfillmentSuggestion {
  return { storeId, storeName, availableStock, recommendedQuantity: availableStock };
}

function line(partial: Partial<LineInput>): LineInput {
  return {
    requested: 2,
    reserved: 0,
    shortage: 0,
    suggestions: [],
    assignments: [],
    ...partial,
  };
}

// --- sortSuggestions ------------------------------------------------------

test.describe('sortSuggestions / recomendada por mayor disponibilidad', () => {
  test('ordena de mayor a menor disponibilidad', () => {
    const sorted = sortSuggestions([sug(1, 5), sug(2, 30), sug(3, 12)]);
    expect(sorted.map((s) => s.storeId)).toEqual([2, 3, 1]);
  });

  test('no muta el arreglo original', () => {
    const original = [sug(1, 5), sug(2, 30)];
    sortSuggestions(original);
    expect(original.map((s) => s.storeId)).toEqual([1, 2]);
  });
});

// --- getPending -----------------------------------------------------------

test.describe('getPending', () => {
  test('descuenta reservado y faltante, nunca negativo', () => {
    expect(getPending(5, 2, 1)).toBe(2);
    expect(getPending(2, 2, 0)).toBe(0);
    expect(getPending(2, 5, 0)).toBe(0);
  });
});

// --- storeAvailable / getAssignedQty -------------------------------------

test.describe('helpers basicos', () => {
  test('storeAvailable devuelve el stock de la tienda o 0', () => {
    const s = [sug(1, 25), sug(2, 10)];
    expect(storeAvailable(s, 1)).toBe(25);
    expect(storeAvailable(s, 99)).toBe(0);
  });

  test('getAssignedQty suma cantidades (ignora negativos)', () => {
    expect(getAssignedQty([{ storeId: 1, quantity: 2 }, { storeId: 2, quantity: 3 }])).toBe(5);
    expect(getAssignedQty([])).toBe(0);
  });
});

// --- buildDefaultAssignment ----------------------------------------------

test.describe('buildDefaultAssignment / autoconfiguracion', () => {
  test('elige la tienda recomendada (mayor stock) y cubre lo pendiente', () => {
    const result = buildDefaultAssignment(3, 0, 0, [sug(1, 5), sug(2, 30)]);
    expect(result).toEqual([{ storeId: 2, quantity: 3 }]);
  });

  test('si el stock recomendado es menor que lo pendiente, asigna el stock disponible', () => {
    const result = buildDefaultAssignment(10, 0, 0, [sug(1, 6)]);
    expect(result).toEqual([{ storeId: 1, quantity: 6 }]);
  });

  test('linea ya totalmente reservada => sin asignacion', () => {
    expect(buildDefaultAssignment(2, 2, 0, [sug(1, 50)])).toEqual([]);
  });

  test('sin sugerencias o sin stock => sin asignacion', () => {
    expect(buildDefaultAssignment(2, 0, 0, [])).toEqual([]);
    expect(buildDefaultAssignment(2, 0, 0, [sug(1, 0)])).toEqual([]);
  });
});

// --- maxForAssignment -----------------------------------------------------

test.describe('maxForAssignment / nunca supera lo solicitado ni el stock', () => {
  test('limitado por lo solicitado cuando hay stock de sobra', () => {
    const input = line({ requested: 3, suggestions: [sug(1, 100)], assignments: [{ storeId: 1, quantity: 0 }] });
    expect(maxForAssignment(input, 0)).toBe(3);
  });

  test('limitado por el stock de la tienda', () => {
    const input = line({ requested: 5, suggestions: [sug(1, 2)], assignments: [{ storeId: 1, quantity: 0 }] });
    expect(maxForAssignment(input, 0)).toBe(2);
  });

  test('descuenta lo reservado', () => {
    const input = line({ requested: 5, reserved: 2, suggestions: [sug(1, 100)], assignments: [{ storeId: 1, quantity: 0 }] });
    expect(maxForAssignment(input, 0)).toBe(3);
  });

  test('en split, descuenta lo asignado en otras tiendas', () => {
    const input = line({
      requested: 10,
      suggestions: [sug(1, 100), sug(2, 100)],
      assignments: [{ storeId: 1, quantity: 6 }, { storeId: 2, quantity: 0 }],
    });
    expect(maxForAssignment(input, 1)).toBe(4);
  });

  test('linea reservada por completo => max 0', () => {
    const input = line({ requested: 2, reserved: 2, suggestions: [sug(1, 100)], assignments: [{ storeId: 1, quantity: 0 }] });
    expect(maxForAssignment(input, 0)).toBe(0);
  });
});

// --- getLineState ---------------------------------------------------------

test.describe('getLineState / reserva en vivo (assignments = reservado por tienda)', () => {
  test('pendiente: con stock, nada reservado', () => {
    expect(getLineState(line({ suggestions: [sug(1, 50)], assignments: [] }))).toBe('pendiente');
  });

  test('reservado: reservado == solicitado', () => {
    const input = line({ requested: 2, suggestions: [sug(1, 50)], assignments: [{ storeId: 1, quantity: 2 }] });
    expect(getLineState(input)).toBe('reservado');
  });

  test('parcial: reservado < solicitado', () => {
    const input = line({ requested: 3, suggestions: [sug(1, 50)], assignments: [{ storeId: 1, quantity: 1 }] });
    expect(getLineState(input)).toBe('parcial');
  });

  test('sin_stock: ninguna tienda con stock y nada reservado', () => {
    expect(getLineState(line({ suggestions: [sug(1, 0)], assignments: [] }))).toBe('sin_stock');
    expect(getLineState(line({ suggestions: [], assignments: [] }))).toBe('sin_stock');
  });

  test('split completo => reservado', () => {
    const input = line({
      requested: 10,
      suggestions: [sug(1, 6), sug(2, 4)],
      assignments: [{ storeId: 1, quantity: 6 }, { storeId: 2, quantity: 4 }],
    });
    expect(getLineState(input)).toBe('reservado');
  });
});

// --- getDisplayedAssigned -------------------------------------------------

test.describe('getDisplayedAssigned / columna Asignado', () => {
  test('suma reservado por tienda, sin pasar de lo solicitado', () => {
    expect(getDisplayedAssigned(line({ requested: 2, assignments: [{ storeId: 1, quantity: 2 }] }))).toBe(2);
    expect(getDisplayedAssigned(line({ requested: 2, assignments: [] }))).toBe(0);
  });

  test('split: suma de tiendas, tope en lo solicitado', () => {
    const input = line({ requested: 3, assignments: [{ storeId: 1, quantity: 2 }, { storeId: 2, quantity: 2 }] });
    expect(getDisplayedAssigned(input)).toBe(3);
  });
});

// --- isLineConfigured -----------------------------------------------------

test.describe('isLineConfigured / cuenta para "Reservar stock (N)"', () => {
  test('configurada cuando hay pendiente y asignacion', () => {
    expect(isLineConfigured(line({ requested: 2, suggestions: [sug(1, 9)], assignments: [{ storeId: 1, quantity: 2 }] }))).toBe(true);
  });

  test('no configurada si no hay asignacion', () => {
    expect(isLineConfigured(line({ requested: 2, assignments: [] }))).toBe(false);
  });

  test('no configurada si ya esta reservada (sin pendiente)', () => {
    const input = line({ requested: 2, reserved: 2, assignments: [{ storeId: 1, quantity: 2 }] });
    expect(isLineConfigured(input)).toBe(false);
  });
});

// --- findSplitCandidate (regresion del bug de division entre tiendas) -----

test.describe('findSplitCandidate / division entre tiendas', () => {
  test('propone otra tienda con stock cuando queda cantidad por asignar', () => {
    const input = line({
      requested: 10,
      suggestions: [sug(1, 6), sug(2, 8)],
      assignments: [{ storeId: 1, quantity: 6 }],
    });
    const candidate = findSplitCandidate(input);
    expect(candidate?.storeId).toBe(2);
  });

  test('null cuando la cantidad ya esta totalmente asignada', () => {
    const input = line({
      requested: 6,
      suggestions: [sug(1, 6), sug(2, 8)],
      assignments: [{ storeId: 1, quantity: 6 }],
    });
    expect(findSplitCandidate(input)).toBeNull();
  });

  test('null cuando no hay otra tienda con stock', () => {
    const input = line({
      requested: 10,
      suggestions: [sug(1, 6), sug(2, 0)],
      assignments: [{ storeId: 1, quantity: 6 }],
    });
    expect(findSplitCandidate(input)).toBeNull();
  });

  test('null cuando la linea ya esta reservada por completo', () => {
    const input = line({
      requested: 2,
      reserved: 2,
      suggestions: [sug(1, 50), sug(2, 50)],
      assignments: [],
    });
    expect(findSplitCandidate(input)).toBeNull();
  });

  test('BUG REGRESION: el split es por-linea; otra linea no se ve afectada', () => {
    // Linea A: pendiente, recibira la division.
    const lineA = line({ requested: 10, suggestions: [sug(1, 6), sug(2, 8)], assignments: [{ storeId: 1, quantity: 6 }] });
    // Linea B: distinta, totalmente asignada => no debe proponer candidato.
    const lineB = line({ requested: 2, suggestions: [sug(1, 50)], assignments: [{ storeId: 1, quantity: 2 }] });
    expect(findSplitCandidate(lineA)?.storeId).toBe(2);
    expect(findSplitCandidate(lineB)).toBeNull();
  });
});

// --- computeStats ---------------------------------------------------------

test.describe('computeStats / resumen superior y pie', () => {
  test('cuenta lineas por estado y totales de unidades', () => {
    const lines: LineInput[] = [
      // parcial (1/2) => cuenta en "configured"
      line({ requested: 2, suggestions: [sug(1, 50)], assignments: [{ storeId: 1, quantity: 1 }] }),
      // reservada (2/2)
      line({ requested: 2, suggestions: [sug(1, 50)], assignments: [{ storeId: 1, quantity: 2 }] }),
      // pendiente/sin stock (0/2)
      line({ requested: 2, suggestions: [], assignments: [] }),
    ];
    const stats = computeStats(lines);
    expect(stats.totalLines).toBe(3);
    expect(stats.configured).toBe(1);
    expect(stats.reservedLines).toBe(1);
    expect(stats.pendingLines).toBe(1);
    expect(stats.totalRequested).toBe(6);
    expect(stats.totalReserved).toBe(3);
    expect(stats.totalAssigned).toBe(3); // 1 (parcial) + 2 (reservada)
    expect(stats.totalPending).toBe(3);
  });

  test('pedido vacio', () => {
    const stats = computeStats([]);
    expect(stats.totalLines).toBe(0);
    expect(stats.totalPending).toBe(0);
  });
});

// --- getHeaderState -------------------------------------------------------

test.describe('getHeaderState / badge del header', () => {
  test('vacio', () => {
    expect(getHeaderState(computeStats([]))).toBe('vacio');
  });

  test('pendiente cuando nada configurado ni reservado', () => {
    const stats = computeStats([line({ requested: 2, suggestions: [sug(1, 9)], assignments: [] })]);
    expect(getHeaderState(stats)).toBe('pendiente');
  });

  test('configurando cuando hay lineas parciales y ninguna reservada por completo', () => {
    const stats = computeStats([line({ requested: 2, suggestions: [sug(1, 9)], assignments: [{ storeId: 1, quantity: 1 }] })]);
    expect(getHeaderState(stats)).toBe('configurando');
  });

  test('reservado_parcial cuando hay reservadas por completo pero no todas', () => {
    const stats = computeStats([
      line({ requested: 2, suggestions: [sug(1, 9)], assignments: [{ storeId: 1, quantity: 2 }] }),
      line({ requested: 2, suggestions: [sug(1, 9)], assignments: [{ storeId: 1, quantity: 1 }] }),
    ]);
    expect(getHeaderState(stats)).toBe('reservado_parcial');
  });

  test('listo_picking cuando todas las lineas estan reservadas', () => {
    const stats = computeStats([
      line({ requested: 2, suggestions: [sug(1, 9)], assignments: [{ storeId: 1, quantity: 2 }] }),
      line({ requested: 1, suggestions: [sug(1, 9)], assignments: [{ storeId: 1, quantity: 1 }] }),
    ]);
    expect(getHeaderState(stats)).toBe('listo_picking');
  });
});

// --- nextStepValue (bug: al bajar saltaba a 0) ----------------------------

test.describe('nextStepValue / stepper +/-', () => {
  test('BUG REGRESION: bajar resta 1 aunque el maximo haya quedado bajo', () => {
    // Estaba en 5, el max cayo a 0 (stock ya reservado) -> antes saltaba a 0.
    expect(nextStepValue(5, -1, 0)).toBe(4);
    expect(nextStepValue(5, -1, 3)).toBe(4);
  });

  test('bajar nunca por debajo de 0', () => {
    expect(nextStepValue(0, -1, 10)).toBe(0);
  });

  test('subir respeta el maximo', () => {
    expect(nextStepValue(2, 1, 3)).toBe(3);
    expect(nextStepValue(3, 1, 3)).toBe(3);
  });
});

// --- resolveVariantSuggestions (bug: producto unico compartido) -----------

test.describe('resolveVariantSuggestions / lineas que comparten variante', () => {
  test('BUG: una linea sin sugerencias hereda las tiendas de su hermana (mismo SKU)', () => {
    // Fila M (variante 7) tiene stock en tienda 1; Fila L (misma variante) llego
    // sin sugerencias -> antes salia "sin stock". Ahora hereda la tienda 1.
    const lines = [
      { variantId: 7, suggestions: [sug(1, 84, 'Feria Mañanera')] },
      { variantId: 7, suggestions: [] as FulfillmentSuggestion[] },
    ];
    const resolved = resolveVariantSuggestions(7, lines);
    expect(resolved.map((s) => s.storeId)).toEqual([1]);
    expect(resolved[0].availableStock).toBe(84);
  });

  test('la linea heredada ya no queda en estado sin_stock', () => {
    const lines = [
      { variantId: 7, suggestions: [sug(1, 84)] },
      { variantId: 7, suggestions: [] as FulfillmentSuggestion[] },
    ];
    const heredada = line({ requested: 2, suggestions: resolveVariantSuggestions(7, lines), assignments: [] });
    expect(getLineState(heredada)).toBe('pendiente');
  });

  test('dedup por tienda tomando el mayor disponible', () => {
    const lines = [
      { variantId: 7, suggestions: [sug(1, 10), sug(2, 5)] },
      { variantId: 7, suggestions: [sug(1, 3), sug(2, 20)] },
    ];
    const resolved = resolveVariantSuggestions(7, lines);
    expect(resolved.map((s) => [s.storeId, s.availableStock])).toEqual([[2, 20], [1, 10]]);
  });

  test('no mezcla sugerencias de otras variantes', () => {
    const lines = [
      { variantId: 7, suggestions: [sug(1, 10)] },
      { variantId: 9, suggestions: [sug(2, 99)] },
    ];
    expect(resolveVariantSuggestions(7, lines).map((s) => s.storeId)).toEqual([1]);
  });
});

// --- Acciones disponibles / no ofrecer acciones que no aplican ------------

test.describe('acciones por linea (no mostrar acciones que no se requieren)', () => {
  test('canReserveMore: false cuando ya esta totalmente reservada', () => {
    expect(canReserveMore(line({ requested: 2, suggestions: [sug(1, 50)], assignments: [{ storeId: 1, quantity: 2 }] }))).toBe(false);
  });

  test('canReserveMore: false cuando no hay stock en ninguna tienda', () => {
    expect(canReserveMore(line({ requested: 2, suggestions: [sug(1, 0)], assignments: [] }))).toBe(false);
    expect(canReserveMore(line({ requested: 2, suggestions: [], assignments: [] }))).toBe(false);
  });

  test('canReserveMore: true con pendiente y stock', () => {
    expect(canReserveMore(line({ requested: 2, suggestions: [sug(1, 50)], assignments: [{ storeId: 1, quantity: 1 }] }))).toBe(true);
  });

  test('canReleaseLine: solo si hay algo reservado', () => {
    expect(canReleaseLine(0)).toBe(false);
    expect(canReleaseLine(3)).toBe(true);
  });

  test('canSplitLine: false si ya esta todo asignado o no hay otra tienda', () => {
    expect(canSplitLine(line({ requested: 2, suggestions: [sug(1, 50)], assignments: [{ storeId: 1, quantity: 2 }] }))).toBe(false);
    expect(canSplitLine(line({ requested: 5, suggestions: [sug(1, 50), sug(2, 0)], assignments: [{ storeId: 1, quantity: 2 }] }))).toBe(false);
  });

  test('canSplitLine: true si queda pendiente y otra tienda con stock', () => {
    expect(canSplitLine(line({ requested: 10, suggestions: [sug(1, 6), sug(2, 8)], assignments: [{ storeId: 1, quantity: 6 }] }))).toBe(true);
  });
});
