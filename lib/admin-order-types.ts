export type AdminOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'WAITING_TRANSFER'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERED'
  | 'RETURN_PENDING'
  | 'CANCELLED'
  | 'WAITING_STOCK';

export type AdminOrderSalesChannel = 'POS' | 'ECOMMERCE' | 'INTERNAL';

export interface AdminSimpleStore {
  id: number;
  name: string;
  code?: string;
}

export interface AdminSimpleUser {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface AdminOrderReturnWorkflow {
  requestedAt?: string | null;
  returnedAt?: string | null;
  acceptanceStatus?: string | null;
  acceptedAt?: string | null;
  cancelledBy?: AdminSimpleUser | null;
  responsible?: AdminSimpleUser | null;
  delegatedBy?: AdminSimpleUser | null;
}

export interface AdminOrderVariantRef {
  id: number;
  sku: string;
  price: number;
  productName: string;
  colorName: string;
  sizeName: string;
}

export interface AdminPickingContribution {
  id: number;
  quantity: number;
  user: AdminSimpleUser | null;
}

export interface AdminPickingUnpickRequest {
  id: number;
  quantity: number;
  note?: string;
  requester: AdminSimpleUser | null;
  createdAt?: string;
}

export interface AdminOrderItem {
  id: number;
  orderItemId?: number;
  pickingItemId?: number;
  variantId: number;
  fulfillmentStoreId?: number;
  fulfillmentStore?: AdminSimpleStore | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  reserved?: number;
  picked?: number;
  requestedQuantity?: number;
  reservedQuantity?: number;
  maxPickableQuantity?: number;
  pendingStockQuantity?: number;
  pickedQuantity?: number;
  pendingQuantity?: number;
  pendingPickingQuantity?: number;
  missingQuantity?: number;
  shortageQuantity?: number;
  removed?: boolean;
  removedAt?: string | null;
  removedReason?: string | null;
  removedNote?: string | null;
  removedByName?: string | null;
  status?: 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'MISSING';
  pickingStatus?: 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'PICKED';
  contributions?: AdminPickingContribution[];
  pendingUnpickRequests?: AdminPickingUnpickRequest[];
  reservationSuggestions?: AdminOrderItemReservationSuggestion[];
  // Reparto por tienda de lo reservado para ESTA linea (ledger del backend).
  reservedByStore?: AdminOrderItemReservedByStore[];
  responsibleUser?: AdminSimpleUser | null;
  updatedAt?: string;
  variant: AdminOrderVariantRef;
}

export interface AdminOrderItemReservedByStore {
  storeId: number;
  storeName: string;
  quantity: number;
}

export interface AdminOrderItemReservationSuggestion {
  inventoryId: number;
  storeId: number;
  storeName: string;
  storeCode?: string;
  storeType?: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
  recommendedQuantity: number;
  isCurrentFulfillmentStore: boolean;
  isSourceStore: boolean;
}

export interface AdminOrderReservation {
  id: number;
  quantity: number;
  status: string;
  inventoryId?: number;
  variantId?: number;
  createdAt?: string;
  inventory?: {
    id: number;
    storeId?: number;
    storeName: string;
    variantSku: string;
  } | null;
  reservedBy?: AdminSimpleUser | null;
}

export interface AdminOrder {
  id: number;
  code: string;
  status: AdminOrderStatus;
  salesChannel: AdminOrderSalesChannel;
  total: number;
  subtotal: number;
  igvAmount: number;
  applyIgv: boolean;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  note: string;
  sourceStore: AdminSimpleStore | null;
  fulfillmentStore: AdminSimpleStore | null;
  primaryResponsible: (AdminSimpleUser & { role?: string }) | null;
  sellerUser?: AdminSimpleUser | null;
  pickerUser?: AdminSimpleUser | null;
  dispenserUser?: AdminSimpleUser | null;
  createdAt: string;
  updatedAt: string;
  items: AdminOrderItem[];
  removedItems?: AdminOrderItem[];
  reservations: AdminOrderReservation[];
  pickingSummary?: {
    totalRequested: number;
    totalPicked: number;
    progress: number;
    completed?: boolean;
  } | null;
  pickingSession?: {
    id: number;
    status: string;
    assignedUser?: AdminSimpleUser | null;
    createdAt?: string;
    updatedAt?: string;
  } | null;
  pickingResponsibility?: {
    enabled: boolean;
    primaryResponsible?: AdminSimpleUser | null;
    sharedResponsibles?: Array<{ id: number; user: AdminSimpleUser | null }>;
    pendingRequests?: Array<{
      id: number;
      mode: string;
      requester: AdminSimpleUser | null;
      createdAt?: string;
    }>;
  } | null;
  returnWorkflow?: AdminOrderReturnWorkflow | null;
}

export interface AdminOrderPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminOrdersListResult {
  data: AdminOrder[];
  pagination: AdminOrderPagination;
}

export interface AdminVariantStockRow {
  variantId: number;
  stock: number;
  reservedStock: number;
  availableStock: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toText(value: unknown, fallback = ''): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function toInt(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) {
    return fallback;
  }
  return numeric;
}

function toNum(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return numeric;
}

function normalizeSimpleStore(raw: unknown): AdminSimpleStore | null {
  if (!isObject(raw)) {
    return null;
  }
  const id = toInt(raw.id, 0);
  const name = toText(raw.name);
  if (id < 1 || !name) {
    return null;
  }
  return {
    id,
    name,
    code: toText(raw.code) || undefined,
  };
}

function normalizeSimpleUser(raw: unknown): AdminSimpleUser | null {
  if (!isObject(raw)) {
    return null;
  }
  const id = toInt(raw.id, 0);
  if (id < 1) {
    return null;
  }
  return {
    id,
    firstName: toText(raw.firstName, '-'),
    lastName: toText(raw.lastName),
    email: toText(raw.email) || undefined,
  };
}

function normalizeOrderVariantRef(raw: unknown, fallbackVariantId: number, fallbackPrice: number): AdminOrderVariantRef {
  const variantRaw = isObject(raw) ? raw : null;
  const productRaw = isObject(variantRaw?.product) ? variantRaw.product : null;
  const colorRaw = isObject(variantRaw?.color) ? variantRaw.color : null;
  const sizeRaw = isObject(variantRaw?.size) ? variantRaw.size : null;
  const variantId = toInt(variantRaw?.id, fallbackVariantId);

  return {
    id: variantId > 0 ? variantId : fallbackVariantId,
    sku: toText(variantRaw?.sku, `VAR-${fallbackVariantId || 0}`),
    price: Math.max(0, toNum(variantRaw?.price, fallbackPrice)),
    productName: toText(variantRaw?.productName, toText(productRaw?.name, 'Producto')),
    colorName: toText(variantRaw?.colorName, toText(colorRaw?.name, 'Sin color')),
    sizeName: toText(variantRaw?.sizeName, toText(sizeRaw?.name, 'Sin talla')),
  };
}

function normalizePickingContribution(raw: unknown): AdminPickingContribution | null {
  if (!isObject(raw)) {
    return null;
  }

  const id = toInt(raw.id, 0);
  if (id < 1) {
    return null;
  }

  return {
    id,
    quantity: Math.max(0, toNum(raw.quantity, 0)),
    user: normalizeSimpleUser(raw.user),
  };
}

function normalizePickingUnpickRequest(raw: unknown): AdminPickingUnpickRequest | null {
  if (!isObject(raw)) {
    return null;
  }

  const id = toInt(raw.id, 0);
  if (id < 1) {
    return null;
  }

  return {
    id,
    quantity: Math.max(0, toNum(raw.quantity, 0)),
    note: toText(raw.note) || undefined,
    requester: normalizeSimpleUser(raw.requester),
    createdAt: toText(raw.createdAt) || undefined,
  };
}

function normalizeOrderItem(raw: unknown): AdminOrderItem | null {
  if (!isObject(raw)) {
    return null;
  }
  const rawId = toInt(raw.id, 0);
  const orderItemId = toInt(raw.orderItemId, toInt(raw.itemId, 0));
  const pickingItemId = toInt(raw.pickingItemId, 0);
  const variantRaw = isObject(raw.variant) ? raw.variant : null;
  const variantId = toInt(raw.variantId, toInt(variantRaw?.id, 0));
  const fulfillmentStore = normalizeSimpleStore(raw.fulfillmentStore);
  const fulfillmentStoreId = toInt(raw.fulfillmentStoreId, fulfillmentStore?.id || 0);
  const id = rawId > 0 ? rawId : (orderItemId > 0 ? orderItemId : pickingItemId);
  const quantity = Math.max(0, toNum(raw.quantity, toNum(raw.requestedQuantity, 0)));
  const variantPrice = Math.max(0, toNum(variantRaw?.price, 0));
  const rawUnitPrice = Math.max(0, toNum(raw.unitPrice, 0));
  const unitPrice = rawUnitPrice > 0 ? rawUnitPrice : variantPrice;
  const rawSubtotal = Math.max(0, toNum(raw.subtotal, 0));
  const subtotal = rawSubtotal > 0 ? rawSubtotal : Math.max(0, quantity * unitPrice);
  const requestedQuantity = Math.max(0, toNum(raw.requestedQuantity, quantity));
  const reservedRaw = Math.max(0, toNum(raw.reserved, 0));
  const reservedQuantity = Math.max(0, toNum(raw.reservedQuantity, reservedRaw));
  const maxPickableQuantity = Math.max(0, toNum(raw.maxPickableQuantity, requestedQuantity));
  const pickedRaw = Math.max(0, toNum(raw.picked, toNum(raw.pickedQuantity, 0)));
  const pickedQuantity = Math.max(0, toNum(raw.pickedQuantity, pickedRaw));
  const missingQuantity = Math.max(0, toNum(raw.missingQuantity, Math.max(0, requestedQuantity - pickedQuantity)));
  const shortageQuantity = Math.max(0, toNum(raw.shortageQuantity, 0));
  const status = toText(raw.status, toText(raw.pickingStatus)).toUpperCase();
  const contributions = Array.isArray(raw.contributions)
    ? raw.contributions
      .map((entry) => normalizePickingContribution(entry))
      .filter((entry): entry is AdminPickingContribution => Boolean(entry))
    : [];
  const pendingUnpickRequests = Array.isArray(raw.pendingUnpickRequests)
    ? raw.pendingUnpickRequests
      .map((entry) => normalizePickingUnpickRequest(entry))
      .filter((entry): entry is AdminPickingUnpickRequest => Boolean(entry))
    : [];
  const reservationSuggestions = Array.isArray(raw.reservationSuggestions)
    ? raw.reservationSuggestions
      .map((entry) => normalizeOrderItemReservationSuggestion(entry))
      .filter((entry): entry is AdminOrderItemReservationSuggestion => Boolean(entry))
    : [];
  const reservedByStore = Array.isArray(raw.reservedByStore)
    ? raw.reservedByStore
      .map((entry) => normalizeOrderItemReservedByStore(entry))
      .filter((entry): entry is AdminOrderItemReservedByStore => Boolean(entry))
    : [];

  if (id < 1 || variantId < 1) {
    return null;
  }

  return {
    id,
    orderItemId: orderItemId > 0 ? orderItemId : undefined,
    pickingItemId: pickingItemId > 0 ? pickingItemId : undefined,
    variantId,
    fulfillmentStoreId: fulfillmentStoreId > 0 ? fulfillmentStoreId : undefined,
    fulfillmentStore,
    quantity,
    unitPrice,
    subtotal,
    reserved: reservedRaw,
    picked: pickedRaw,
    requestedQuantity,
    reservedQuantity,
    maxPickableQuantity,
    pendingStockQuantity: toNum(raw.pendingStockQuantity, 0),
    pickedQuantity,
    missingQuantity,
    shortageQuantity,
    removed: Boolean(raw.removed ?? raw.removedAt),
    removedAt: toText(raw.removedAt) || null,
    removedReason: toText(raw.removedReason) || null,
    removedNote: toText(raw.removedNote) || null,
    removedByName: toText(raw.removedByName) || null,
    pendingQuantity: toNum(raw.pendingQuantity, 0),
    pendingPickingQuantity: toNum(raw.pendingPickingQuantity, 0),
    status: (status === 'COMPLETED' || status === 'PARTIAL' || status === 'PENDING' || status === 'MISSING') ? status : undefined,
    pickingStatus: toText(raw.pickingStatus) as AdminOrderItem['pickingStatus'],
    contributions,
    pendingUnpickRequests,
    reservationSuggestions,
    reservedByStore,
    responsibleUser: normalizeSimpleUser(raw.responsibleUser),
    updatedAt: toText(raw.updatedAt) || undefined,
    variant: normalizeOrderVariantRef(variantRaw, variantId, unitPrice),
  };
}

function normalizeOrderItemReservedByStore(raw: unknown): AdminOrderItemReservedByStore | null {
  if (!isObject(raw)) {
    return null;
  }
  const storeId = toNum(raw.storeId, 0);
  const quantity = Math.max(0, toNum(raw.quantity, 0));
  if (storeId < 1 || quantity <= 0) {
    return null;
  }
  return {
    storeId,
    storeName: toText(raw.storeName) || `Tienda ${storeId}`,
    quantity,
  };
}

function normalizeOrderItemReservationSuggestion(raw: unknown): AdminOrderItemReservationSuggestion | null {
  if (!isObject(raw)) {
    return null;
  }

  const inventoryId = toInt(raw.inventoryId, 0);
  const storeId = toInt(raw.storeId, 0);
  if (inventoryId < 1 || storeId < 1) {
    return null;
  }

  const availableStock = Math.max(0, toNum(raw.availableStock, 0));
  const recommendedQuantity = Math.max(0, toNum(raw.recommendedQuantity, Math.min(1, availableStock)));

  return {
    inventoryId,
    storeId,
    storeName: toText(raw.storeName, `Tienda ${storeId}`),
    storeCode: toText(raw.storeCode) || undefined,
    storeType: toText(raw.storeType) || undefined,
    stock: Math.max(0, toNum(raw.stock, 0)),
    reservedStock: Math.max(0, toNum(raw.reservedStock, 0)),
    availableStock,
    recommendedQuantity,
    isCurrentFulfillmentStore: raw.isCurrentFulfillmentStore === true,
    isSourceStore: raw.isSourceStore === true,
  };
}

function normalizeOrderReservation(raw: unknown): AdminOrderReservation | null {
  if (!isObject(raw)) {
    return null;
  }

  const id = toInt(raw.id, 0);
  if (id < 1) {
    return null;
  }

  const inventoryRaw = isObject(raw.inventory) ? raw.inventory : null;
  const storeRaw = isObject(inventoryRaw?.store) ? inventoryRaw?.store : null;
  const variantRaw = isObject(inventoryRaw?.variant) ? inventoryRaw?.variant : null;
  const reservedBy = normalizeSimpleUser(raw.reservedBy);

  return {
    id,
    quantity: Math.max(0, toNum(raw.quantity, 0)),
    status: toText(raw.status, 'UNKNOWN'),
    inventoryId: toInt(raw.inventoryId, 0) || undefined,
    variantId: toInt(raw.variantId, 0) || undefined,
    createdAt: toText(raw.createdAt) || undefined,
    inventory: inventoryRaw
      ? {
        id: toInt(inventoryRaw.id, 0),
        storeId: toInt(inventoryRaw.storeId, toInt(storeRaw?.id, 0)) || undefined,
        storeName: toText(storeRaw?.name, '-'),
        variantSku: toText(variantRaw?.sku, '-'),
      }
      : null,
    reservedBy,
  };
}

function normalizePickingSummary(raw: unknown): AdminOrder['pickingSummary'] {
  if (!isObject(raw)) {
    return null;
  }

  return {
    totalRequested: Math.max(0, toNum(raw.totalRequested, 0)),
    totalPicked: Math.max(0, toNum(raw.totalPicked, 0)),
    progress: Math.max(0, Math.min(100, toNum(raw.progress, 0))),
    completed: raw.completed === true,
  };
}

function normalizePickingSession(raw: unknown): AdminOrder['pickingSession'] {
  if (!isObject(raw)) {
    return null;
  }

  const id = toInt(raw.id, 0);
  if (id < 1) {
    return null;
  }

  return {
    id,
    status: toText(raw.status, 'UNKNOWN'),
    assignedUser: normalizeSimpleUser(raw.assignedUser),
    createdAt: toText(raw.createdAt) || undefined,
    updatedAt: toText(raw.updatedAt) || undefined,
  };
}

function normalizePickingResponsibility(raw: unknown): AdminOrder['pickingResponsibility'] {
  if (!isObject(raw)) {
    return null;
  }

  return {
    enabled: raw.enabled === true,
    primaryResponsible: normalizeSimpleUser(raw.primaryResponsible),
    sharedResponsibles: Array.isArray(raw.sharedResponsibles)
      ? raw.sharedResponsibles.map((entry) => ({
        id: toInt((entry as { id?: unknown })?.id, 0),
        user: normalizeSimpleUser((entry as { user?: unknown })?.user),
      }))
      : [],
    pendingRequests: Array.isArray(raw.pendingRequests)
      ? raw.pendingRequests.map((entry) => ({
        id: toInt((entry as { id?: unknown })?.id, 0),
        mode: toText((entry as { mode?: unknown })?.mode, 'SHARED'),
        requester: normalizeSimpleUser((entry as { requester?: unknown })?.requester),
        createdAt: toText((entry as { createdAt?: unknown })?.createdAt) || undefined,
      }))
      : [],
  };
}

function normalizeOrderRecord(raw: unknown): AdminOrder | null {
  if (!isObject(raw)) {
    return null;
  }

  const id = toInt(raw.id, toInt(raw.orderId, 0));
  const code = toText(raw.code, toText(raw.orderCode));
  const status = toText(raw.status, toText(raw.orderStatus)) as AdminOrderStatus;
  if (id < 1 || !code || !status) {
    return null;
  }

  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items = itemsRaw
    .map((item) => normalizeOrderItem(item))
    .filter((item): item is AdminOrderItem => Boolean(item));

  const removedItemsRaw = Array.isArray(raw.removedItems) ? raw.removedItems : [];
  const removedItems = removedItemsRaw
    .map((item) => normalizeOrderItem(item))
    .filter((item): item is AdminOrderItem => Boolean(item));

  const reservationsRaw = Array.isArray(raw.reservations) ? raw.reservations : [];
  const reservations = reservationsRaw
    .map((row) => normalizeOrderReservation(row))
    .filter((row): row is AdminOrderReservation => Boolean(row));

  const pickingSummaryRaw = isObject(raw.pickingSummary)
    ? raw.pickingSummary
    : (isObject(raw.summary) ? raw.summary : null);
  const pickingSessionRaw = isObject(raw.pickingSession) ? raw.pickingSession : null;
  const pickingResponsibilityRaw = isObject(raw.pickingResponsibility) ? raw.pickingResponsibility : null;
  const returnWorkflowRaw = isObject(raw.returnWorkflow) ? raw.returnWorkflow : null;

  const sourceStore = normalizeSimpleStore(raw.sourceStore);
  const fulfillmentStore = normalizeSimpleStore(raw.fulfillmentStore);
  const primaryResponsibleRaw = isObject(raw.primaryResponsible) ? raw.primaryResponsible : null;
  const primaryResponsibleBase = normalizeSimpleUser(primaryResponsibleRaw);
  const computedSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const rawSubtotal = Math.max(0, toNum(raw.subtotal, 0));
  const subtotal = rawSubtotal > 0 ? rawSubtotal : computedSubtotal;
  const igvAmount = Math.max(0, toNum(raw.igvAmount, toNum(raw.tax, 0)));
  const rawTotal = Math.max(0, toNum(raw.total, 0));
  const total = rawTotal > 0 ? rawTotal : subtotal + igvAmount;
  const rawSalesChannel = toText(raw.salesChannel, 'INTERNAL').toUpperCase();
  const salesChannel = rawSalesChannel === 'ECOMMERCE' || code.toUpperCase().startsWith('MK-')
    ? 'ECOMMERCE'
    : (rawSalesChannel === 'POS' ? 'POS' : 'INTERNAL');

  return {
    id,
    code,
    status,
    salesChannel: salesChannel as AdminOrderSalesChannel,
    total,
    subtotal,
    igvAmount,
    applyIgv: raw.applyIgv === true || igvAmount > 0,
    clientName: toText(raw.clientName),
    clientEmail: toText(raw.clientEmail),
    clientPhone: toText(raw.clientPhone),
    note: toText(raw.note),
    sourceStore,
    fulfillmentStore,
    primaryResponsible: primaryResponsibleBase
      ? {
        ...primaryResponsibleBase,
        role: toText(primaryResponsibleRaw?.role) || undefined,
      }
      : null,
    sellerUser: normalizeSimpleUser(raw.sellerUser),
    pickerUser: normalizeSimpleUser(raw.pickerUser),
    dispenserUser: normalizeSimpleUser(raw.dispenserUser),
    createdAt: toText(raw.createdAt),
    updatedAt: toText(raw.updatedAt),
    items,
    removedItems,
    reservations,
    pickingSummary: normalizePickingSummary(pickingSummaryRaw),
    pickingSession: normalizePickingSession(pickingSessionRaw),
    pickingResponsibility: normalizePickingResponsibility(pickingResponsibilityRaw),
    returnWorkflow: returnWorkflowRaw
      ? {
        requestedAt: toText(returnWorkflowRaw.requestedAt) || null,
        returnedAt: toText(returnWorkflowRaw.returnedAt) || null,
        acceptanceStatus: toText(returnWorkflowRaw.acceptanceStatus) || null,
        acceptedAt: toText(returnWorkflowRaw.acceptedAt) || null,
        cancelledBy: normalizeSimpleUser(returnWorkflowRaw.cancelledBy),
        responsible: normalizeSimpleUser(returnWorkflowRaw.responsible),
        delegatedBy: normalizeSimpleUser(returnWorkflowRaw.delegatedBy),
      }
      : null,
  };
}

export function normalizeOrdersListResponse(payload: unknown): AdminOrdersListResult {
  const dataRaw = Array.isArray((payload as { data?: unknown[] } | null)?.data)
    ? (payload as { data: unknown[] }).data
    : [];

  const data = dataRaw
    .map((item) => normalizeOrderRecord(item))
    .filter((item): item is AdminOrder => Boolean(item));

  const paginationRaw = isObject((payload as { pagination?: unknown } | null)?.pagination)
    ? (payload as { pagination: Record<string, unknown> }).pagination
    : {};

  const pagination: AdminOrderPagination = {
    page: Math.max(1, toInt(paginationRaw.page, 1)),
    limit: Math.max(1, toInt(paginationRaw.limit, 10)),
    total: Math.max(0, toInt(paginationRaw.total, data.length)),
    totalPages: Math.max(1, toInt(paginationRaw.totalPages, 1)),
  };

  return { data, pagination };
}

export function normalizeOrderDetailResponse(payload: unknown): AdminOrder | null {
  const raw = isObject((payload as { data?: unknown } | null)?.data)
    ? (payload as { data: unknown }).data
    : payload;

  return normalizeOrderRecord(raw);
}

export function normalizeOrderPickingResponse(payload: unknown, fallbackOrder?: AdminOrder | null): AdminOrder | null {
  const normalized = normalizeOrderDetailResponse(payload);
  if (!normalized) {
    return fallbackOrder || null;
  }
  if (!fallbackOrder) {
    return normalized;
  }

  // La respuesta de picking reconstruye los items sin reservationSuggestions ni
  // shortageQuantity (solo existen en el detalle). Al mergear, preservamos esos
  // campos del detalle (fallbackOrder) emparejando por id de order item.
  const mergedItems = normalized.items.length > 0
    ? normalized.items.map((pickingItem) => {
      const detailItem = fallbackOrder.items.find((d) => (
        d.id === (pickingItem.orderItemId || pickingItem.id)
      ));
      if (!detailItem) {
        return pickingItem;
      }
      const pickingSuggestions = pickingItem.reservationSuggestions || [];
      const pickingReservedByStore = Array.isArray(pickingItem.reservedByStore) ? pickingItem.reservedByStore : [];
      return {
        ...pickingItem,
        shortageQuantity: pickingItem.shortageQuantity ?? detailItem.shortageQuantity,
        reservationSuggestions: pickingSuggestions.length > 0
          ? pickingSuggestions
          : detailItem.reservationSuggestions,
        // La atribucion de reserva (cuanto y en que tienda) es AUTORIDAD del
        // detalle: `getOrderById` la trae real por linea (reserved + reservedByStore
        // + fulfillmentStore). La respuesta de picking la reconstruye vacia
        // (reserved undefined, reservedByStore null) y pisaria la verdad → el panel
        // mostraria "0 reservado / Sin stock" en lineas que SI estan reservadas.
        reserved: (pickingItem.reserved && pickingItem.reserved > 0) ? pickingItem.reserved : detailItem.reserved,
        reservedQuantity: (pickingItem.reservedQuantity && pickingItem.reservedQuantity > 0)
          ? pickingItem.reservedQuantity
          : detailItem.reservedQuantity,
        reservedByStore: pickingReservedByStore.length > 0 ? pickingReservedByStore : detailItem.reservedByStore,
        fulfillmentStoreId: pickingItem.fulfillmentStoreId || detailItem.fulfillmentStoreId,
        fulfillmentStore: pickingItem.fulfillmentStore || detailItem.fulfillmentStore,
        // Estado de eliminacion vive en el detalle; el picking no lo trae.
        removed: pickingItem.removed || detailItem.removed,
        removedAt: pickingItem.removedAt ?? detailItem.removedAt,
        removedReason: pickingItem.removedReason ?? detailItem.removedReason,
        removedNote: pickingItem.removedNote ?? detailItem.removedNote,
        removedByName: pickingItem.removedByName ?? detailItem.removedByName,
      };
    })
    : fallbackOrder.items;

  return {
    ...fallbackOrder,
    ...normalized,
    // El dinero (total/subtotal/IGV) es autoridad del DETALLE: `getOrderById`
    // devuelve el total almacenado (con IGV) que `recomputeOrderTotals` mantiene
    // al agregar/eliminar. La respuesta de picking NO trae totales monetarios
    // (los recalcularia desde items sin IGV), asi que no debe pisarlos.
    total: fallbackOrder.total > 0 ? fallbackOrder.total : normalized.total,
    subtotal: fallbackOrder.subtotal > 0 ? fallbackOrder.subtotal : normalized.subtotal,
    igvAmount: fallbackOrder.igvAmount > 0 ? fallbackOrder.igvAmount : normalized.igvAmount,
    applyIgv: fallbackOrder.applyIgv || normalized.applyIgv,
    clientName: normalized.clientName || fallbackOrder.clientName,
    clientEmail: normalized.clientEmail || fallbackOrder.clientEmail,
    clientPhone: normalized.clientPhone || fallbackOrder.clientPhone,
    note: normalized.note || fallbackOrder.note,
    sourceStore: normalized.sourceStore || fallbackOrder.sourceStore,
    fulfillmentStore: normalized.fulfillmentStore || fallbackOrder.fulfillmentStore,
    items: mergedItems,
    // Los eliminados solo vienen en el detalle (la respuesta de picking no los trae).
    removedItems: (normalized.removedItems && normalized.removedItems.length > 0)
      ? normalized.removedItems
      : fallbackOrder.removedItems,
    reservations: normalized.reservations.length > 0 ? normalized.reservations : fallbackOrder.reservations,
    pickingSummary: normalized.pickingSummary || fallbackOrder.pickingSummary || null,
    pickingSession: normalized.pickingSession || fallbackOrder.pickingSession || null,
    pickingResponsibility: normalized.pickingResponsibility || fallbackOrder.pickingResponsibility || null,
  };
}

export function normalizeVariantStockResponse(payload: unknown): AdminVariantStockRow[] {
  const dataRaw = Array.isArray((payload as { data?: unknown[] } | null)?.data)
    ? (payload as { data: unknown[] }).data
    : (Array.isArray(payload) ? payload : []);

  const rows: AdminVariantStockRow[] = [];
  for (const row of dataRaw) {
    const item = row as {
      variantId?: unknown;
      stock?: unknown;
      reservedStock?: unknown;
      availableStock?: unknown;
    };
    const variantId = toInt(item.variantId, 0);
    if (variantId < 1) {
      continue;
    }
    const stock = Math.max(0, toNum(item.stock, 0));
    const reservedStock = Math.max(0, toNum(item.reservedStock, 0));
    const availableStock = Number.isFinite(Number(item.availableStock))
      ? Math.max(0, toNum(item.availableStock, 0))
      : Math.max(0, stock - reservedStock);

    rows.push({
      variantId,
      stock,
      reservedStock,
      availableStock,
    });
  }
  return rows;
}
