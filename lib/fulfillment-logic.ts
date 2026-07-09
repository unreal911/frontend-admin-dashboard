// Logica pura de la preparacion de pedido ecommerce.
// Sin React ni acceso a red: facil de testear. El componente
// `EcommerceFulfillmentPanel` consume estas funciones.

export type LineState = 'pendiente' | 'configurado' | 'parcial' | 'reservado' | 'sin_stock';

export interface FulfillmentSuggestion {
  storeId: number;
  storeName: string;
  availableStock: number;
  recommendedQuantity: number;
}

export interface FulfillmentAssignment {
  storeId: number;
  quantity: number;
}

export interface LineInput {
  requested: number;
  reserved: number;
  shortage: number;
  suggestions: FulfillmentSuggestion[];
  assignments: FulfillmentAssignment[];
}

/** Ordena sugerencias por mayor disponibilidad (la recomendada queda primera). */
export function sortSuggestions(suggestions: FulfillmentSuggestion[]): FulfillmentSuggestion[] {
  return [...suggestions].sort((a, b) => b.availableStock - a.availableStock);
}

/** Unidades que aun falta cubrir (ni reservadas ni marcadas como faltante). */
export function getPending(requested: number, reserved: number, shortage: number): number {
  return Math.max(0, requested - reserved - shortage);
}

/** Suma de unidades asignadas en el borrador (todas las tiendas de la linea). */
export function getAssignedQty(assignments: FulfillmentAssignment[]): number {
  return assignments.reduce((sum, a) => sum + Math.max(0, a.quantity), 0);
}

/** Stock disponible de una tienda concreta dentro de las sugerencias. */
export function storeAvailable(suggestions: FulfillmentSuggestion[], storeId: number): number {
  return Math.max(0, suggestions.find((s) => s.storeId === storeId)?.availableStock ?? 0);
}

/**
 * Asignacion por defecto: tienda recomendada (mayor disponibilidad) con la
 * cantidad maxima posible. Vacia si la linea no tiene pendiente o no hay stock.
 */
export function buildDefaultAssignment(
  requested: number,
  reserved: number,
  shortage: number,
  suggestions: FulfillmentSuggestion[],
): FulfillmentAssignment[] {
  const pending = getPending(requested, reserved, shortage);
  if (pending <= 0) {
    return [];
  }
  const best = sortSuggestions(suggestions)[0];
  if (!best || best.availableStock <= 0) {
    return [];
  }
  return [{ storeId: best.storeId, quantity: Math.min(pending, best.availableStock) }];
}

/**
 * Maximo reservable para una asignacion: limitado por lo que queda de la linea
 * (solicitado - reservado - otras asignaciones) y por el stock de su tienda.
 */
export function maxForAssignment(input: LineInput, index: number): number {
  const { requested, reserved, suggestions, assignments } = input;
  const target = assignments[index];
  if (!target) {
    return 0;
  }
  const otherAssigned = assignments.reduce(
    (sum, a, i) => (i === index ? sum : sum + Math.max(0, a.quantity)),
    0,
  );
  const available = storeAvailable(suggestions, target.storeId);
  return Math.max(0, Math.min(requested - reserved - otherAssigned, available));
}

/**
 * Cantidad total reservada mostrada en la columna Asignado. En el modelo de
 * reserva en vivo, `assignments` = unidades reservadas por tienda (objetivo),
 * asi que no se suma `reserved` aparte (se evita el doble-conteo).
 */
export function getDisplayedAssigned(input: LineInput): number {
  return Math.min(input.requested, getAssignedQty(input.assignments));
}

/**
 * Estado de la linea en el modelo de reserva en vivo. `assignments` = unidades
 * reservadas por tienda; el total reservado es su suma:
 * - reservado: cubre lo solicitado
 * - parcial: reservado > 0 pero < solicitado
 * - sin_stock: nada reservado y ninguna tienda con stock
 * - pendiente: nada reservado pero hay stock disponible
 */
export function getLineState(input: LineInput): LineState {
  const { requested, suggestions, assignments } = input;
  const assigned = getAssignedQty(assignments);
  if (requested > 0 && assigned >= requested) {
    return 'reservado';
  }
  if (assigned > 0) {
    return 'parcial';
  }
  const hasStock = suggestions.some((s) => s.availableStock > 0);
  return hasStock ? 'pendiente' : 'sin_stock';
}

/**
 * Una linea esta "configurada" (cuenta para "Reservar stock (N)") si tiene
 * pendiente real por reservar y al menos una unidad asignada en el borrador.
 */
export function isLineConfigured(input: LineInput): boolean {
  const pending = getPending(input.requested, input.reserved, input.shortage);
  return pending > 0 && getAssignedQty(input.assignments) > 0;
}

/**
 * Siguiente tienda candidata para dividir una linea entre varias tiendas:
 * una tienda con stock aun no usada, solo si queda cantidad por asignar.
 */
export function findSplitCandidate(input: LineInput): FulfillmentSuggestion | null {
  const { requested, reserved, suggestions, assignments } = input;
  const remaining = requested - reserved - getAssignedQty(assignments);
  if (remaining <= 0) {
    return null;
  }
  const used = new Set(assignments.map((a) => a.storeId));
  return sortSuggestions(suggestions).find((s) => !used.has(s.storeId) && s.availableStock > 0) || null;
}

/**
 * Une las sugerencias de todas las lineas que comparten variante ("producto
 * unico": varias filas Color/Talla = mismo SKU y mismo stock). Asi una linea
 * sin sugerencias propias hereda las tiendas con stock de sus hermanas y no
 * aparece como "sin stock" por error. Dedup por tienda tomando el mayor stock.
 */
export function resolveVariantSuggestions<T extends FulfillmentSuggestion>(
  variantId: number,
  lines: { variantId: number; suggestions: T[] }[],
): T[] {
  const byStore = new Map<number, T>();
  for (const line of lines) {
    if (Number(line.variantId) !== Number(variantId)) {
      continue;
    }
    for (const s of line.suggestions) {
      const prev = byStore.get(s.storeId);
      if (!prev || s.availableStock > prev.availableStock) {
        byStore.set(s.storeId, s);
      }
    }
  }
  return [...byStore.values()].sort((a, b) => b.availableStock - a.availableStock);
}

/**
 * Siguiente valor de un stepper +/-: subir respeta el maximo; bajar solo no
 * baja de 0. Clave: al bajar NO se recorta al maximo, para no saltar a 0 (o de
 * golpe) cuando el maximo quedo por debajo del valor actual (p.ej. el stock
 * disponible ya se reservo). Liberar siempre debe poder bajar de a 1.
 */
export function nextStepValue(current: number, delta: number, max: number): number {
  if (delta > 0) {
    return Math.min(max, current + delta);
  }
  return Math.max(0, current + delta);
}

/** ¿Se puede reservar mas en la linea? Requiere pendiente y stock en alguna tienda. */
export function canReserveMore(input: LineInput): boolean {
  const remaining = input.requested - getAssignedQty(input.assignments);
  return remaining > 0 && input.suggestions.some((s) => s.availableStock > 0);
}

/** ¿Se puede liberar la linea? Solo si tiene algo reservado. */
export function canReleaseLine(reserved: number): boolean {
  return reserved > 0;
}

/** ¿Se puede dividir la linea en otra tienda? Requiere pendiente y otra tienda con stock. */
export function canSplitLine(input: LineInput): boolean {
  const remaining = input.requested - getAssignedQty(input.assignments);
  return remaining > 0 && findSplitCandidate(input) !== null;
}

export interface FulfillmentStats {
  totalLines: number;
  configured: number;
  reservedLines: number;
  pendingLines: number;
  totalRequested: number;
  totalReserved: number;
  totalAssigned: number;
  totalPending: number;
}

/** Metricas agregadas del resumen superior y del pie. */
export function computeStats(lines: LineInput[]): FulfillmentStats {
  let configured = 0;
  let reservedLines = 0;
  let pendingLines = 0;
  let totalRequested = 0;
  let totalReserved = 0;
  let totalAssigned = 0;
  for (const line of lines) {
    const state = getLineState(line);
    const assigned = Math.min(line.requested, getAssignedQty(line.assignments));
    totalRequested += line.requested;
    totalReserved += assigned;
    totalAssigned += assigned;
    if (state === 'reservado') reservedLines += 1;
    else if (state === 'parcial') configured += 1;
    else pendingLines += 1; // pendiente | sin_stock
  }
  return {
    totalLines: lines.length,
    configured,
    reservedLines,
    pendingLines,
    totalRequested,
    totalReserved,
    totalAssigned,
    totalPending: Math.max(0, totalRequested - totalAssigned),
  };
}

export type HeaderState = 'pendiente' | 'configurando' | 'reservado_parcial' | 'listo_picking' | 'vacio';

/** Estado global del pedido para el badge del header. */
export function getHeaderState(stats: FulfillmentStats): HeaderState {
  if (stats.totalLines === 0) return 'vacio';
  if (stats.reservedLines === stats.totalLines) return 'listo_picking';
  if (stats.reservedLines > 0) return 'reservado_parcial';
  if (stats.configured > 0) return 'configurando';
  return 'pendiente';
}
