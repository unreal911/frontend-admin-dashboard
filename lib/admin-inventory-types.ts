export type InventoryMovementType =
  | 'IN'
  | 'OUT'
  | 'ADJUSTMENT'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'RESERVED'
  | 'UNRESERVED';

export type InventoryReservationStatus = 'ACTIVE' | 'RELEASED' | 'COMPLETED';

export type StockTransferStatus = 'PENDING' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

export interface InventoryStore {
  id: number;
  name: string;
  code: string;
  type?: string;
  isActive?: boolean;
}

export interface InventoryVariantProduct {
  id: number;
  name: string;
}

export interface InventoryVariantColor {
  id: number;
  name: string;
}

export interface InventoryVariantSize {
  id: number;
  name: string;
}

export interface InventoryVariant {
  id: number;
  sku: string;
  barcode?: string;
  price: string;
  isActive?: boolean;
  product: InventoryVariantProduct;
  color: InventoryVariantColor;
  size: InventoryVariantSize;
}

export interface Inventory {
  id: number;
  stock: number;
  reservedStock: number;
  availableStock?: number;
  store: InventoryStore;
  variant: InventoryVariant;
}

export interface InventoryMovement {
  id: number;
  type: InventoryMovementType;
  quantity: number;
  note?: string | null;
  createdAt: string;
  inventory: Inventory;
  responsibleUser?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
}

export interface InventoryReservationOrderSummary {
  id: number;
  code: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryReservation {
  id: number;
  quantity: number;
  status: InventoryReservationStatus;
  createdAt: string;
  updatedAt: string;
  inventoryId: number;
  variantId: number;
  orderId?: number | null;
  inventory: Inventory;
  order?: InventoryReservationOrderSummary | null;
  reservedBy?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
}

export interface InventoryReservedReconcileResultItem {
  inventoryId: number;
  storeId: number;
  storeName: string;
  variantId: number;
  sku: string;
  previousReservedStock: number;
  targetReservedStock: number;
  difference: number;
  reconciled: boolean;
}

export interface InventoryReservedReconcileResult {
  adjustedCount: number;
  unchangedCount: number;
  requestedInventoryCount?: number;
  processedInventoryCount: number;
  items: InventoryReservedReconcileResultItem[];
}

export interface StockTransferItem {
  id: number;
  quantity: number;
  variantId: number;
  variant: InventoryVariant;
}

export interface StockTransfer {
  id: number;
  code: string;
  status: StockTransferStatus;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  fromStoreId: number;
  toStoreId: number;
  fromStore: InventoryStore;
  toStore: InventoryStore;
  createdBy?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
  receivedBy?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
  items: StockTransferItem[];
}

export interface ProductForInventoryCatalog {
  id: number;
  name: string;
  hasColor: boolean;
  hasSize: boolean;
  variants?: Array<{
    id: number;
    sku: string;
    isActive?: boolean;
    color?: { id: number; name: string } | null;
    size?: { id: number; name: string } | null;
  }>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toPositiveInt(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) {
    return null;
  }
  return numeric;
}

function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return numeric;
}

function toText(value: unknown, fallback = ''): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizeVariant(raw: unknown): InventoryVariant | null {
  if (!isObject(raw)) {
    return null;
  }

  const id = toPositiveInt(raw.id);
  const sku = toText(raw.sku);
  if (!id || !sku) {
    return null;
  }

  const productRaw = isObject(raw.product) ? raw.product : null;
  const colorRaw = isObject(raw.color) ? raw.color : null;
  const sizeRaw = isObject(raw.size) ? raw.size : null;
  const productId = toPositiveInt(productRaw?.id);
  // Modelo unificado: color/talla pueden ser null (producto unico / solo talla).
  // id 0 + nombre vacio representa "sin dimension" (se muestra como "Unico"/"—").
  const colorId = toPositiveInt(colorRaw?.id) ?? 0;
  const sizeId = toPositiveInt(sizeRaw?.id) ?? 0;
  const productName = toText(productRaw?.name);
  const colorName = colorId ? toText(colorRaw?.name, 'Sin color') : '';
  const sizeName = sizeId ? toText(sizeRaw?.name, 'Sin talla') : '';
  if (!productId || !productName) {
    return null;
  }

  return {
    id,
    sku,
    barcode: toText(raw.barcode) || undefined,
    price: toText(raw.price, '0'),
    isActive: raw.isActive !== false,
    product: {
      id: productId,
      name: productName,
    },
    color: {
      id: colorId,
      name: colorName,
    },
    size: {
      id: sizeId,
      name: sizeName,
    },
  };
}

function normalizeStore(raw: unknown): InventoryStore | null {
  if (!isObject(raw)) {
    return null;
  }

  const id = toPositiveInt(raw.id);
  const name = toText(raw.name);
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    code: toText(raw.code, '-'),
    type: toText(raw.type) || undefined,
    isActive: raw.isActive === false ? false : true,
  };
}

export function normalizeInventoryList(payload: unknown): Inventory[] {
  const data = Array.isArray(payload)
    ? payload
    : (Array.isArray((payload as { data?: unknown[] } | null)?.data) ? (payload as { data: unknown[] }).data : []);

  const normalized: Inventory[] = [];
  for (const item of data) {
    if (!isObject(item)) {
      continue;
    }

    const id = toPositiveInt(item.id);
    const store = normalizeStore(item.store);
    const variant = normalizeVariant(item.variant);
    if (!id || !store || !variant) {
      continue;
    }

    const stock = toNumber(item.stock, 0);
    const reservedStock = toNumber(item.reservedStock, 0);
    const availableStockRaw = item.availableStock;
    const availableStock = Number.isFinite(Number(availableStockRaw))
      ? Number(availableStockRaw)
      : stock - reservedStock;

    normalized.push({
      id,
      stock,
      reservedStock,
      availableStock,
      store,
      variant,
    });
  }

  return normalized;
}

export function normalizeInventoryMovements(payload: unknown): InventoryMovement[] {
  const data = Array.isArray(payload)
    ? payload
    : (Array.isArray((payload as { data?: unknown[] } | null)?.data) ? (payload as { data: unknown[] }).data : []);

  const normalized: InventoryMovement[] = [];
  for (const item of data) {
    if (!isObject(item)) {
      continue;
    }

    const id = toPositiveInt(item.id);
    const inventoryList = normalizeInventoryList([item.inventory]);
    const inventory = inventoryList[0];
    const type = toText(item.type) as InventoryMovementType;
    if (!id || !inventory || !type) {
      continue;
    }

    const responsibleRaw = isObject(item.responsibleUser) ? item.responsibleUser : null;
    const responsibleId = toPositiveInt(responsibleRaw?.id);
    const firstName = toText(responsibleRaw?.firstName);
    const lastName = toText(responsibleRaw?.lastName);

    normalized.push({
      id,
      type,
      quantity: toNumber(item.quantity, 0),
      note: toText(item.note) || null,
      createdAt: toText(item.createdAt),
      inventory,
      responsibleUser: responsibleId && firstName
        ? {
          id: responsibleId,
          firstName,
          lastName,
        }
        : null,
    });
  }

  return normalized;
}

export function normalizeReservations(payload: unknown): InventoryReservation[] {
  const data = Array.isArray(payload)
    ? payload
    : (Array.isArray((payload as { data?: unknown[] } | null)?.data) ? (payload as { data: unknown[] }).data : []);

  const normalized: InventoryReservation[] = [];
  for (const item of data) {
    if (!isObject(item)) {
      continue;
    }

    const id = toPositiveInt(item.id);
    const inventoryList = normalizeInventoryList([item.inventory]);
    const inventory = inventoryList[0];
    const status = toText(item.status) as InventoryReservationStatus;
    if (!id || !inventory || !status) {
      continue;
    }

    const reservedByRaw = isObject(item.reservedBy) ? item.reservedBy : null;
    const reservedById = toPositiveInt(reservedByRaw?.id);
    const orderRaw = isObject(item.order) ? item.order : null;
    const orderId = toPositiveInt(orderRaw?.id);

    normalized.push({
      id,
      quantity: toNumber(item.quantity, 0),
      status,
      createdAt: toText(item.createdAt),
      updatedAt: toText(item.updatedAt),
      inventoryId: Number(item.inventoryId || inventory.id),
      variantId: Number(item.variantId || inventory.variant.id),
      orderId: toPositiveInt(item.orderId) || null,
      inventory,
      order: orderId
        ? {
          id: orderId,
          code: toText(orderRaw?.code, `#${orderId}`),
          status: toText(orderRaw?.status, '-'),
          createdAt: toText(orderRaw?.createdAt),
          updatedAt: toText(orderRaw?.updatedAt),
        }
        : null,
      reservedBy: reservedById
        ? {
          id: reservedById,
          firstName: toText(reservedByRaw?.firstName, '-'),
          lastName: toText(reservedByRaw?.lastName),
        }
        : null,
    });
  }

  return normalized;
}

export function normalizeTransfers(payload: unknown): StockTransfer[] {
  const data = Array.isArray(payload)
    ? payload
    : (Array.isArray((payload as { data?: unknown[] } | null)?.data) ? (payload as { data: unknown[] }).data : []);

  const normalized: StockTransfer[] = [];
  for (const item of data) {
    if (!isObject(item)) {
      continue;
    }

    const id = toPositiveInt(item.id);
    const code = toText(item.code);
    const status = toText(item.status) as StockTransferStatus;
    const fromStore = normalizeStore(item.fromStore);
    const toStore = normalizeStore(item.toStore);
    if (!id || !code || !status || !fromStore || !toStore) {
      continue;
    }

    const createdByRaw = isObject(item.createdBy) ? item.createdBy : null;
    const createdById = toPositiveInt(createdByRaw?.id);
    const receivedByRaw = isObject(item.receivedBy) ? item.receivedBy : null;
    const receivedById = toPositiveInt(receivedByRaw?.id);

    const itemsRaw = Array.isArray(item.items) ? item.items : [];
    const items: StockTransferItem[] = [];
    for (const transferItemRaw of itemsRaw) {
      if (!isObject(transferItemRaw)) {
        continue;
      }
      const itemId = toPositiveInt(transferItemRaw.id);
      const variantId = toPositiveInt(transferItemRaw.variantId);
      const variant = normalizeVariant(transferItemRaw.variant);
      if (!itemId || !variantId || !variant) {
        continue;
      }
      items.push({
        id: itemId,
        quantity: toNumber(transferItemRaw.quantity, 0),
        variantId,
        variant,
      });
    }

    normalized.push({
      id,
      code,
      status,
      note: toText(item.note) || null,
      createdAt: toText(item.createdAt),
      updatedAt: toText(item.updatedAt),
      fromStoreId: Number(item.fromStoreId || fromStore.id),
      toStoreId: Number(item.toStoreId || toStore.id),
      fromStore,
      toStore,
      createdBy: createdById
        ? {
          id: createdById,
          firstName: toText(createdByRaw?.firstName, '-'),
          lastName: toText(createdByRaw?.lastName),
        }
        : null,
      receivedBy: receivedById
        ? {
          id: receivedById,
          firstName: toText(receivedByRaw?.firstName, '-'),
          lastName: toText(receivedByRaw?.lastName),
        }
        : null,
      items,
    });
  }

  return normalized;
}

export function normalizeProductsForInventoryCatalog(payload: unknown): ProductForInventoryCatalog[] {
  const data = Array.isArray((payload as { data?: unknown[] } | null)?.data)
    ? (payload as { data: unknown[] }).data
    : (Array.isArray(payload) ? payload : []);

  const normalized: ProductForInventoryCatalog[] = [];
  for (const item of data) {
    if (!isObject(item)) {
      continue;
    }

    const productId = toPositiveInt(item.id);
    const productName = toText(item.name);
    if (!productId || !productName) {
      continue;
    }

    const variantsRaw = Array.isArray(item.variants) ? item.variants : [];
    const variants: ProductForInventoryCatalog['variants'] = [];
    for (const variantRaw of variantsRaw) {
      if (!isObject(variantRaw)) {
        continue;
      }
      const variantId = toPositiveInt(variantRaw.id);
      const sku = toText(variantRaw.sku, '');
      if (!variantId || !sku) {
        continue;
      }
      variants.push({
        id: variantId,
        sku,
        isActive: variantRaw.isActive !== false,
        color: isObject(variantRaw.color)
          ? {
            id: Number(variantRaw.color.id || 0),
            name: toText(variantRaw.color.name, 'Sin color'),
          }
          : null,
        size: isObject(variantRaw.size)
          ? {
            id: Number(variantRaw.size.id || 0),
            name: toText(variantRaw.size.name, 'Sin talla'),
          }
          : null,
      });
    }

    // Ejes reales del producto: prioriza los flags null-based del backend; fallback a
    // detectar por variantes con color/talla presentes (sin centinelas de nombre).
    const hasColor = typeof item.hasColor === 'boolean'
      ? item.hasColor
      : variants.some((variant) => variant.color != null);
    const hasSize = typeof item.hasSize === 'boolean'
      ? item.hasSize
      : variants.some((variant) => variant.size != null);

    normalized.push({
      id: productId,
      name: productName,
      hasColor,
      hasSize,
      variants,
    });
  }

  return normalized;
}

// Saltos de cantidad frecuentes en mayorista (media docena, docena, 2 docenas).
export const QUICK_QTY_PRESETS = [6, 12, 24];

export function getAvailabilityClass(available: number): string {
  if (available <= 0) return 'is-out';
  if (available <= 10) return 'is-low';
  return 'is-ok';
}

export function computeAvailableStock(item: Inventory): number {
  const availableStock = Number(item.availableStock);
  if (Number.isFinite(availableStock)) {
    return availableStock;
  }
  return Number(item.stock || 0) - Number(item.reservedStock || 0);
}

export function normalizeInventoryAttribute(value?: string | null): string {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.startsWith('__SIN_')) {
    return '';
  }
  return normalized;
}

export function getInventoryVariantDisplay(item: Inventory): string {
  const sizeName = normalizeInventoryAttribute(item.variant.size?.name);
  const colorName = normalizeInventoryAttribute(item.variant.color?.name);
  const parts = [colorName, sizeName].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Unico';
}

