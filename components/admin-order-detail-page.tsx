'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { AdminSelect, AdminSelectOption } from '@/components/admin-select';
import { useAdminUi } from '@/components/admin-ui-provider';
import { EcommerceFulfillmentPanel } from '@/components/ecommerce-fulfillment-panel';
import { AdminOrderReturnPanel } from '@/components/admin-order-return-panel';
import { PickingScanPanel } from '@/components/picking-scan-panel';
import {
  AdminOrder,
  AdminOrderItem,
  AdminOrderReservation,
  AdminSimpleUser,
  AdminOrderStatus,
  normalizeOrderDetailResponse,
  normalizeOrderPickingResponse,
} from '@/lib/admin-order-types';

const STATUS_OPTIONS: Array<{ value: AdminOrderStatus; label: string }> = [
  { value: 'PENDING', label: 'Pendiente' },
  { value: 'CONFIRMED', label: 'Confirmado' },
  { value: 'WAITING_TRANSFER', label: 'Esperando transferencia' },
  { value: 'PREPARING', label: 'Preparando' },
  { value: 'READY', label: 'Listo' },
  { value: 'DELIVERED', label: 'Entregado' },
  { value: 'RETURN_PENDING', label: 'Pendiente devolucion' },
  { value: 'CANCELLED', label: 'Cancelado' },
  { value: 'WAITING_STOCK', label: 'Sin stock' },
];
const STATUS_VALUES = new Set<AdminOrderStatus>(STATUS_OPTIONS.map((option) => option.value));

const STATUS_COLORS: Record<AdminOrderStatus, string> = {
  PENDING: '#f39c12',
  CONFIRMED: '#3498db',
  WAITING_TRANSFER: '#9b59b6',
  PREPARING: '#e67e22',
  READY: '#27ae60',
  DELIVERED: '#16a085',
  RETURN_PENDING: '#d35400',
  CANCELLED: '#e74c3c',
  WAITING_STOCK: '#c0392b',
};

const AVAILABLE_TRANSITIONS: Record<AdminOrderStatus, AdminOrderStatus[]> = {
  PENDING: ['CONFIRMED', 'WAITING_STOCK', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'WAITING_TRANSFER', 'CANCELLED'],
  WAITING_STOCK: ['CONFIRMED', 'CANCELLED'],
  WAITING_TRANSFER: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['DELIVERED', 'CANCELLED'],
  RETURN_PENDING: ['CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

type PrintLayout = 'invoice' | 'ticket';
type AssignRole = 'seller' | 'picker' | 'dispenser';

const PRINT_LAYOUT_OPTIONS: AdminSelectOption<PrintLayout>[] = [
  { value: 'invoice', label: 'Boleta A4' },
  { value: 'ticket', label: 'Ticket termico' },
];

const ASSIGN_ROLE_OPTIONS: AdminSelectOption<AssignRole>[] = [
  { value: 'seller', label: 'Vendedor' },
  { value: 'picker', label: 'Picker' },
  { value: 'dispenser', label: 'Despachador' },
];

interface TimelineEvent {
  label: string;
  date: Date | null;
  description: string;
}

interface AssignableUserOption {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: 'Pendiente',
    CONFIRMED: 'Confirmado',
    WAITING_TRANSFER: 'Esperando transferencia',
    PREPARING: 'Preparando',
    READY: 'Listo',
    DELIVERED: 'Entregado',
    RETURN_PENDING: 'Pendiente devolucion',
    CANCELLED: 'Cancelado',
    WAITING_STOCK: 'Sin stock',
  };
  return labels[String(status || '').toUpperCase()] || status || '-';
}

function normalizeOrderStatus(status: unknown): AdminOrderStatus | null {
  const normalized = String(status || '').trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  return STATUS_VALUES.has(normalized as AdminOrderStatus)
    ? (normalized as AdminOrderStatus)
    : null;
}

function getStatusColor(status: AdminOrderStatus): string {
  return STATUS_COLORS[status] || '#95a5a6';
}

function getChannelLabel(channel: string): string {
  const normalized = String(channel || '').toUpperCase();
  if (normalized === 'POS') return 'POS';
  if (normalized === 'ECOMMERCE') return 'Ecommerce';
  if (normalized === 'INTERNAL') return 'Interno';
  return 'No definido';
}

function formatMoney(value: number): string {
  return `S/ ${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatDateTimeFromDate(value: Date | null): string {
  if (!value || Number.isNaN(value.getTime())) {
    return 'Sin fecha';
  }
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(value);
}

function parsePaymentMethod(note: string): string {
  const match = String(note || '').match(/(?:Metodo de pago|METODO_PAGO)\s*:\s*([^|]+)/i);
  return match?.[1]?.trim() || 'No especificado';
}

function parsePaymentReference(note: string): string {
  const match = String(note || '').match(/Ref:\s*([^|]+)/i);
  return match?.[1]?.trim() || '-';
}

function parseClientAddress(note: string): string {
  const match = String(note || '').match(/(?:^|\|)\s*DIRECCION\s*:\s*([^|]+)/i);
  return match?.[1]?.trim() || '';
}

function parsePaymentAmount(note: string, labels: string[]): number | null {
  const safeLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = String(note || '').match(new RegExp(`(?:${safeLabels})\\s*:\\s*S?\\/?\\s*([\\d.,]+)`, 'i'));
  if (!match?.[1]) return null;
  const normalized = match[1].replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parsePaymentAmountLabel(note: string, labels: string[]): string {
  const value = parsePaymentAmount(note, labels);
  return value === null ? 'No disponible' : formatMoney(value);
}

function getDisplayNote(note: string): string {
  const segments = String(note || '')
    .split('|')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const customerNote = segments.find((segment) => /^NOTA_CLIENTE\s*:/i.test(segment));
  if (customerNote) {
    return customerNote.replace(/^NOTA_CLIENTE\s*:\s*/i, '').trim() || '-';
  }

  const visibleSegments = segments.filter((segment) => {
    if (/^(CHANNEL|ORIGIN|DELIVERY_TYPE|EMPRESA|RUC|DIRECCION|REFERENCIA|RECOJO_TIENDA_ID|METODO_PAGO_ID|METODO_PAGO|MKT_GUIDE_ITEMS|RESERVA)\s*:/i.test(segment)) {
      return false;
    }
    if (/^(Metodo de pago|Ref|Monto recibido|Monto pagado|Pagado|Vuelto|Cambio)\s*:/i.test(segment)) {
      return false;
    }
    return true;
  });

  return visibleSegments.join(' | ') || '-';
}

function getStatusProgress(status: AdminOrderStatus): number {
  const sequence: AdminOrderStatus[] = ['PENDING', 'CONFIRMED', 'WAITING_TRANSFER', 'PREPARING', 'READY', 'DELIVERED'];
  const index = sequence.indexOf(status);
  if (status === 'CANCELLED') return 100;
  if (status === 'RETURN_PENDING') return 90;
  if (status === 'WAITING_STOCK') return 20;
  if (index < 0) return 0;
  return Math.round(((index + 1) / sequence.length) * 100);
}

function getNextStates(status: AdminOrderStatus): AdminOrderStatus[] {
  return AVAILABLE_TRANSITIONS[status] || [];
}

function getPickedQuantity(item: AdminOrderItem): number {
  return Math.max(0, Number(item.pickedQuantity ?? item.picked ?? 0));
}

function getRequestedQuantity(item: AdminOrderItem): number {
  return Math.max(0, Number(item.requestedQuantity ?? item.quantity ?? 0));
}

function getReservedQuantity(item: AdminOrderItem): number {
  return Math.max(0, Number(item.reservedQuantity ?? item.reserved ?? 0));
}

function getShortageQuantity(item: AdminOrderItem): number {
  return Math.max(0, Number(item.shortageQuantity ?? 0));
}

function getPendingReservationQuantity(item: AdminOrderItem): number {
  return Math.max(0, getRequestedQuantity(item) - getReservedQuantity(item) - getShortageQuantity(item));
}

function getPickingItemLimit(item: AdminOrderItem): number {
  const requestedQuantity = getRequestedQuantity(item);
  const explicitMax = Number(item.maxPickableQuantity);
  if (Number.isFinite(explicitMax) && explicitMax >= 0) {
    return Math.min(requestedQuantity, explicitMax);
  }

  const reservedQuantity = Number(item.reservedQuantity ?? item.reserved);
  if (Number.isFinite(reservedQuantity) && reservedQuantity >= 0) {
    return Math.min(requestedQuantity, reservedQuantity);
  }

  return requestedQuantity;
}

function getPickingStatus(item: AdminOrderItem): 'PENDING' | 'PARTIAL' | 'COMPLETED' {
  const picked = getPickedQuantity(item);
  const requested = getRequestedQuantity(item);
  if (picked <= 0) return 'PENDING';
  if (picked >= requested) return 'COMPLETED';
  return 'PARTIAL';
}

function getPickingStatusLabel(item: AdminOrderItem): string {
  const status = getPickingStatus(item);
  if (status === 'COMPLETED') return 'Completo';
  if (status === 'PARTIAL') return 'Parcial';
  return 'Pendiente';
}

function getPickingStatusClass(item: AdminOrderItem): 'is-picked' | 'is-partial' | 'is-pending' {
  const status = getPickingStatus(item);
  if (status === 'COMPLETED') return 'is-picked';
  if (status === 'PARTIAL') return 'is-partial';
  return 'is-pending';
}

type DetailPickingStatus = 'PENDING' | 'PARTIAL' | 'COMPLETED';

type DetailPickingGroup = {
  key: string;
  items: AdminOrderItem[];
  representative: AdminOrderItem;
  requested: number;
  picked: number;
  limit: number;
  missing: number;
  status: DetailPickingStatus;
};

// Agrupa las lineas del mismo producto + color + talla en una sola fila de
// picking, sumando Solicitada/Separada/Faltante. Se agrupa por color/talla (NO
// por variantId): en "producto unico" todas las filas comparten el mismo
// variantId y el color/talla es solo display, asi que Blanco-L, Negro-L y
// Melange-XL deben quedar en filas distintas y solo se suman las de igual
// color+talla del mismo producto.
// Clave de agrupacion de una fila de picking: producto + color + talla.
function detailGroupKeyOf(item: AdminOrderItem): string {
  return `${item.variant.productName}|${item.variant.colorName}|${item.variant.sizeName}`;
}

function groupDetailPickingItems(items: AdminOrderItem[]): DetailPickingGroup[] {
  const buckets = new Map<string, AdminOrderItem[]>();
  const order: string[] = [];
  items.forEach((item) => {
    const key = detailGroupKeyOf(item);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(item);
  });

  return order.map((key) => {
    const groupItems = buckets.get(key)!;
    const requested = groupItems.reduce((sum, item) => sum + getRequestedQuantity(item), 0);
    const picked = groupItems.reduce((sum, item) => sum + getPickedQuantity(item), 0);
    const limit = groupItems.reduce((sum, item) => sum + getPickingItemLimit(item), 0);
    let status: DetailPickingStatus = 'PENDING';
    if (picked <= 0) {
      status = 'PENDING';
    } else if (picked >= requested && requested > 0) {
      status = 'COMPLETED';
    } else {
      status = 'PARTIAL';
    }
    return {
      key,
      items: groupItems,
      representative: groupItems[0],
      requested,
      picked,
      limit,
      missing: Math.max(0, requested - picked),
      status,
    };
  });
}

function detailPickingStatusLabel(status: DetailPickingStatus): string {
  if (status === 'COMPLETED') return 'Completo';
  if (status === 'PARTIAL') return 'Parcial';
  return 'Pendiente';
}

function detailPickingStatusClass(status: DetailPickingStatus): 'is-picked' | 'is-partial' | 'is-pending' {
  if (status === 'COMPLETED') return 'is-picked';
  if (status === 'PARTIAL') return 'is-partial';
  return 'is-pending';
}

function detailPickingStatusFromCounts(picked: number, requested: number): DetailPickingStatus {
  if (picked <= 0) return 'PENDING';
  if (picked >= requested && requested > 0) return 'COMPLETED';
  return 'PARTIAL';
}

type DetailPickingProductSection = {
  key: string;
  productName: string;
  initial: string;
  groups: DetailPickingGroup[];
};

// Forma minima del picking devuelto por el PATCH que consumimos para el patch
// local (respuesta parcial sin recargar todo el pedido).
type PickingSyncPayload = {
  orderStatus?: unknown;
  pickingResponsibility?: { enabled?: unknown } | null;
  summary?: { progress?: unknown } | null;
  items?: Array<{ orderItemId?: unknown; pickedQuantity?: unknown }> | null;
};

// Tarjeta compacta de un producto en el picking movil: encabezado (miniatura +
// nombre + estado agregado) y una fila por variante con Solic/Sep/Falt y las
// acciones (- / + / Completar → "C"). Se extrae como componente para no anidar
// dos .map en el render del padre (el react-compiler lo marca como acceso a
// refs en render); aqui el map de variantes es de un solo nivel.
function PickingMobileProductSection({
  section,
  getEffectivePicked,
  isGroupUpdatingDetail,
  onMark,
  onSetAbsolute,
  canUpdate,
  canOperate,
  selectedKeys,
  onToggleSelect,
}: {
  section: DetailPickingProductSection;
  getEffectivePicked: (item: AdminOrderItem) => number;
  isGroupUpdatingDetail: (group: DetailPickingGroup) => boolean;
  onMark: (group: DetailPickingGroup, action: 'inc' | 'dec' | 'complete') => void;
  onSetAbsolute: (group: DetailPickingGroup, value: number) => void;
  canUpdate: boolean;
  canOperate: boolean;
  selectedKeys: Set<string>;
  onToggleSelect: (key: string) => void;
}) {
  const sectionPicked = section.groups.reduce(
    (sum, g) => sum + g.items.reduce((s, item) => s + getEffectivePicked(item), 0),
    0,
  );
  const allCompleted = section.groups.every((g) => {
    const p = g.items.reduce((s, item) => s + getEffectivePicked(item), 0);
    return p >= g.requested && g.requested > 0;
  });
  const sectionStatus: DetailPickingStatus = allCompleted ? 'COMPLETED' : sectionPicked > 0 ? 'PARTIAL' : 'PENDING';
  return (
    <div className="pk-product">
      <div className="pk-product-head">
        <span className="pk-thumb" aria-hidden>{section.initial}</span>
        <span className="pk-product-name">{section.productName}</span>
        <span className={`pk-status ${detailPickingStatusClass(sectionStatus)}`}>{detailPickingStatusLabel(sectionStatus)}</span>
      </div>
      <div className="pk-rows">
        {section.groups.map((group) => {
          const representative = group.representative;
          const isSyncing = isGroupUpdatingDetail(group);
          const picked = group.items.reduce((sum, item) => sum + getEffectivePicked(item), 0);
          const missing = Math.max(0, group.requested - picked);
          const status = detailPickingStatusFromCounts(picked, group.requested);
          return (
            <div key={`picking-mobile-row-${group.key}`} className={`pk-row ${detailPickingStatusClass(status)}`}>
              <input
                type="checkbox"
                className="pk-row-select"
                aria-label="Seleccionar variante"
                checked={selectedKeys.has(group.key)}
                onChange={() => onToggleSelect(group.key)}
              />
              <div className="pk-var">
                <span className="pk-var-name">
                  {representative.variant.colorName || '-'} · {representative.variant.sizeName || '-'}
                </span>
                {group.items.length > 1 ? <small className="admin-muted-text">({group.items.length} lineas)</small> : null}
              </div>
              <div className="pk-metrics">
                <span className="pk-metric"><b>{group.requested}</b><small>Solic</small></span>
                <span className="pk-metric is-picked"><b>{picked}</b><small>Sep</small></span>
                <span className={`pk-metric${missing > 0 ? ' is-missing' : ''}`}><b>{missing}</b><small>Falt</small></span>
              </div>
              <div className="pk-row-actions">
                <button
                  type="button"
                  className="pk-step"
                  aria-label="Quitar una unidad separada"
                  onClick={() => onMark(group, 'dec')}
                  disabled={!canUpdate || !canOperate || isSyncing || picked <= 0}
                >
                  -
                </button>
                <input
                  className="pk-picked-input"
                  type="text"
                  inputMode="numeric"
                  aria-label="Cantidad separada"
                  value={picked}
                  disabled={!canUpdate || !canOperate || isSyncing}
                  onChange={(event) => onSetAbsolute(group, Number(event.target.value.replace(/\D/g, '')) || 0)}
                />
                <button
                  type="button"
                  className="pk-step"
                  aria-label="Separar una unidad"
                  onClick={() => onMark(group, 'inc')}
                  disabled={!canUpdate || !canOperate || isSyncing || picked >= group.limit}
                >
                  +
                </button>
                <button
                  type="button"
                  className="pk-complete"
                  title="Completar"
                  aria-label="Completar"
                  onClick={() => onMark(group, 'complete')}
                  disabled={!canUpdate || !canOperate || isSyncing || picked >= group.limit}
                >
                  <span className="pk-complete-short" aria-hidden>C</span>
                  <span className="pk-complete-full">Completar</span>
                </button>
                {isSyncing ? <span className="ff-spinner ff-spinner-sm order-detail-pick-spin-next" aria-hidden /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Debounce de la separacion en vivo en "Picking Operativo": tras +/- se espera
// este lapso antes de llamar a la API (igual que la reserva del panel).
const PICKING_SYNC_DEBOUNCE_MS = 1500;

// Identificadores de linea de picking (puros: solo leen campos del item).
function getOrderItemId(item: AdminOrderItem): number {
  const raw = Number(item.orderItemId ?? item.id ?? 0);
  return Number.isInteger(raw) && raw > 0 ? raw : 0;
}

function getPickingItemId(item: AdminOrderItem): number {
  const raw = Number(item.pickingItemId || 0);
  return Number.isInteger(raw) && raw > 0 ? raw : 0;
}

function getNormalizedVariantId(item: AdminOrderItem): number {
  const raw = Number(item.variantId || item.variant?.id || 0);
  return Number.isInteger(raw) && raw > 0 ? raw : 0;
}

function getPickingUpdateKey(item: AdminOrderItem): string {
  const orderItemId = getOrderItemId(item);
  if (orderItemId > 0) {
    return `order-item:${orderItemId}`;
  }

  const pickingItemId = getPickingItemId(item);
  if (pickingItemId > 0) {
    return `picking-item:${pickingItemId}`;
  }

  const variantId = getNormalizedVariantId(item);
  if (variantId > 0) {
    return `variant:${variantId}`;
  }

  return '';
}

function getReservationStatusLabel(status: string): string {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'ACTIVE') return 'Activa';
  if (normalized === 'RELEASED') return 'Liberada';
  if (normalized === 'COMPLETED') return 'Consumida';
  return status || '-';
}

function getPrintItemDescription(item: AdminOrderItem): string {
  const productName = item.variant?.productName || 'Producto';
  const colorName = item.variant?.colorName || '';
  const sizeName = item.variant?.sizeName || '';
  const details = [colorName, sizeName].filter((value) => value.trim().length > 0).join(' - ');
  return details ? `${productName} (${details})` : productName;
}

function normalizeAssignableUsers(payload: unknown): AssignableUserOption[] {
  const source = Array.isArray(payload)
    ? payload
    : (Array.isArray((payload as { data?: unknown[] } | null)?.data) ? (payload as { data: unknown[] }).data : []);

  const rows: AssignableUserOption[] = [];
  for (const candidate of source) {
    const raw = candidate as {
      id?: unknown;
      firstName?: unknown;
      lastName?: unknown;
      email?: unknown;
      isActive?: unknown;
    };
    const id = Number(raw.id);
    if (!Number.isInteger(id) || id < 1 || raw.isActive === false) {
      continue;
    }
    const firstName = String(raw.firstName || '').trim();
    const lastName = String(raw.lastName || '').trim();
    const email = String(raw.email || '').trim();
    rows.push({
      id,
      firstName,
      lastName,
      email,
    });
  }
  return rows;
}

function buildTimelineEvents(order: AdminOrder): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    label: 'Orden creada',
    date: order.createdAt ? new Date(order.createdAt) : null,
    description: 'Pedido registrado en el sistema',
  });

  if (order.reservations.length > 0) {
    const firstReservationDate = order.reservations
      .map((reservation) => (reservation.createdAt ? new Date(reservation.createdAt) : null))
      .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())[0];

    events.push({
      label: 'Stock reservado',
      date: firstReservationDate || null,
      description: `${order.reservations.length} reserva(s) asociada(s)`,
    });
  }

  if (order.pickingSession?.id) {
    events.push({
      label: 'Picking iniciado',
      date: order.updatedAt ? new Date(order.updatedAt) : null,
      description: 'Se inicio la preparacion del pedido',
    });
  }

  if (order.status === 'READY') {
    events.push({
      label: 'Pedido listo',
      date: order.updatedAt ? new Date(order.updatedAt) : null,
      description: 'Listo para despacho/entrega',
    });
  }

  if (order.status === 'DELIVERED') {
    events.push({
      label: 'Pedido entregado',
      date: order.updatedAt ? new Date(order.updatedAt) : null,
      description: 'Entrega confirmada',
    });
  }

  if (order.status === 'RETURN_PENDING') {
    events.push({
      label: 'Cancelacion en proceso',
      date: order.returnWorkflow?.requestedAt
        ? new Date(order.returnWorkflow.requestedAt)
        : (order.updatedAt ? new Date(order.updatedAt) : null),
      description: 'Pendiente devolucion de stock',
    });
  }

  if (order.status === 'CANCELLED') {
    events.push({
      label: 'Pedido cancelado',
      date: order.updatedAt ? new Date(order.updatedAt) : null,
      description: 'Cancelacion finalizada y reservas liberadas',
    });
  }

  if (order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && order.status !== 'RETURN_PENDING' && order.updatedAt) {
    events.push({
      label: `Estado actual: ${getStatusLabel(order.status)}`,
      date: new Date(order.updatedAt),
      description: 'Ultima actualizacion registrada',
    });
  }

  return events.sort((a, b) => {
    const dateA = a.date ? a.date.getTime() : 0;
    const dateB = b.date ? b.date.getTime() : 0;
    return dateA - dateB;
  });
}

interface AdminOrderDetailPageProps {
  orderId: number;
}

export function AdminOrderDetailPage({ orderId }: AdminOrderDetailPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm, showAlert } = useAdminUi();
  const { hasPermission, user } = useAdminAuth();

  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<AdminOrderStatus>('PENDING');
  const [statusNote, setStatusNote] = useState('');
  const [printLayout, setPrintLayout] = useState<PrintLayout>('invoice');
  const [activeTab, setActiveTab] = useState<'prep' | 'products' | 'reservations' | 'history'>('prep');
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  // Menú compacto de acciones de cabecera (movil) y form de cambio de estado
  // colapsado por defecto para reducir scroll en operador interno.
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [lastAutoPrintedOrderId, setLastAutoPrintedOrderId] = useState<number | null>(null);
  const [startingPicking, setStartingPicking] = useState(false);
  const [finishingPicking, setFinishingPicking] = useState(false);
  const [pickingAll, setPickingAll] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const [fullscreenPicking, setFullscreenPicking] = useState(false);
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(new Set());
  // Edicion "en caliente" del pedido durante el picking (agregar/cambiar/quitar).
  const [editingDuringPicking, setEditingDuringPicking] = useState(false);
  const [deliveringOrder, setDeliveringOrder] = useState(false);
  // Separacion en vivo (optimista + debounce POR FILA/grupo). Override de cantidad
  // separada por linea (para pintar en vivo) y set de FILAS con PATCH en vuelo
  // (para spinner/bloqueo de botones). El debounce es por grupo: cada +/- reinicia
  // el timer de esa fila y recien tras 1.5s inactiva se postean sus lineas.
  const [pickedOverrides, setPickedOverrides] = useState<Record<string, number>>({});
  const [syncingGroupKeys, setSyncingGroupKeys] = useState<string[]>([]);
  const pickedOverridesRef = useRef<Record<string, number>>({});
  const pickingDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pickingInFlightRef = useRef<Set<string>>(new Set());
  const pickingDirtyRef = useRef<Set<string>>(new Set());
  const schedulePickingGroupSyncRef = useRef<((groupKey: string) => void) | null>(null);
  const orderRef = useRef<AdminOrder | null>(null);
  const [assignUsers, setAssignUsers] = useState<AssignableUserOption[]>([]);
  const [loadingAssignUsers, setLoadingAssignUsers] = useState(false);
  const [assignUsersError, setAssignUsersError] = useState('');
  const [assignRole, setAssignRole] = useState<AssignRole>('seller');
  const [assignUserId, setAssignUserId] = useState(0);
  const [assigningResponsible, setAssigningResponsible] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [returnDelegateUserId, setReturnDelegateUserId] = useState(0);
  const [returnDelegateNote, setReturnDelegateNote] = useState('');
  const [delegatingReturn, setDelegatingReturn] = useState(false);
  const [showReturnDelegateModal, setShowReturnDelegateModal] = useState(false);
  const [acceptingReturn, setAcceptingReturn] = useState(false);
  const [completingReturn, setCompletingReturn] = useState(false);
  const [returnResponsibilityManagementEnabled, setReturnResponsibilityManagementEnabled] = useState(true);
  const [pickingResponsibilityFlowEnabledSetting, setPickingResponsibilityFlowEnabledSetting] = useState<boolean | null>(null);
  const [companyInfo, setCompanyInfo] = useState<{ name: string; address: string; phone: string }>({ name: '', address: '', phone: '' });
  const hasLoadedOrderOnceRef = useRef(false);

  const canUpdateOrderStatus = hasPermission('orders.status.update');
  const canStartPickingPermission = hasPermission('picking.start');
  const canUpdatePickingPermission = hasPermission('picking.update');
  const canCompletePickingPermission = hasPermission('picking.complete');
  const shouldAutoPrint = searchParams.get('print') === '1';
  const preferredPrintLayout: PrintLayout = searchParams.get('style') === 'ticket' ? 'ticket' : 'invoice';
  const printDocParam = String(searchParams.get('doc') || '').toUpperCase();
  const printDocLabel = printDocParam === 'NOTA'
    ? 'NOTA DE VENTA'
    : printDocParam === 'FACTURA'
      ? 'FACTURA'
      : 'BOLETA DE VENTA';
  const printDocShort = printDocParam === 'NOTA'
    ? 'Nota de venta'
    : printDocParam === 'FACTURA'
      ? 'Factura'
      : 'Boleta';
  const currentUserId = Number(user?.id || 0);
  const pickingPrimaryResponsible = order?.pickingResponsibility?.primaryResponsible || null;
  const isPickingResponsibilityFlowEnabled = useMemo(() => {
    if (pickingResponsibilityFlowEnabledSetting !== null) {
      return pickingResponsibilityFlowEnabledSetting;
    }
    return order?.pickingResponsibility?.enabled === true;
  }, [order?.pickingResponsibility?.enabled, pickingResponsibilityFlowEnabledSetting]);
  const isCurrentUserPickingPrimaryResponsible = useMemo(() => {
    const responsibleId = Number(pickingPrimaryResponsible?.id || 0);
    return Number.isInteger(currentUserId) && currentUserId > 0 && currentUserId === responsibleId;
  }, [currentUserId, pickingPrimaryResponsible?.id]);
  const isCurrentUserPickingSharedResponsible = useMemo(() => {
    if (!Number.isInteger(currentUserId) || currentUserId < 1) {
      return false;
    }
    const sharedRows = order?.pickingResponsibility?.sharedResponsibles || [];
    return sharedRows.some((entry) => Number(entry.user?.id || 0) === currentUserId);
  }, [currentUserId, order?.pickingResponsibility?.sharedResponsibles]);
  const canCurrentUserOperatePickingByResponsibility = useMemo(() => {
    if (!isPickingResponsibilityFlowEnabled) {
      return true;
    }
    if (!Number.isInteger(currentUserId) || currentUserId < 1) {
      return false;
    }
    if (!pickingPrimaryResponsible) {
      return true;
    }
    return isCurrentUserPickingPrimaryResponsible || isCurrentUserPickingSharedResponsible;
  }, [
    currentUserId,
    isCurrentUserPickingPrimaryResponsible,
    isCurrentUserPickingSharedResponsible,
    isPickingResponsibilityFlowEnabled,
    pickingPrimaryResponsible,
  ]);

  const normalizedCurrentOrderStatus = useMemo(
    () => normalizeOrderStatus(order?.status) || null,
    [order?.status],
  );

  const detailPickingGroups = useMemo(
    () => groupDetailPickingItems(order?.items ?? []),
    [order?.items],
  );
  // Agrupa las filas de picking por producto para el layout compacto en movil:
  // un encabezado por producto (miniatura + nombre) y sus variantes debajo, una
  // por fila. El estado agregado se calcula en el render con el separado en vivo.
  const detailPickingProductSections = useMemo(() => {
    const map = new Map<string, { key: string; productName: string; initial: string; groups: DetailPickingGroup[] }>();
    const order: string[] = [];
    for (const group of detailPickingGroups) {
      const name = group.representative.variant.productName || 'Producto';
      const key = `prod:${name}`;
      if (!map.has(key)) {
        map.set(key, { key, productName: name, initial: (name.trim().charAt(0) || '?').toUpperCase(), groups: [] });
        order.push(key);
      }
      map.get(key)!.groups.push(group);
    }
    return order.map((key) => map.get(key)!);
  }, [detailPickingGroups]);
  const nextStates = useMemo(
    () => (order && normalizedCurrentOrderStatus ? getNextStates(normalizedCurrentOrderStatus) : []),
    [order, normalizedCurrentOrderStatus],
  );
  const timelineEvents = useMemo(() => (order ? buildTimelineEvents(order) : []), [order]);
  const reservationVariantLookup = useMemo(() => {
    const map = new Map<number, { productName: string; colorName: string; sizeName: string }>();
    if (!order) {
      return map;
    }
    for (const item of order.items) {
      map.set(item.variantId, {
        productName: item.variant.productName,
        colorName: item.variant.colorName,
        sizeName: item.variant.sizeName,
      });
    }
    return map;
  }, [order]);
  const pickingProgress = useMemo(() => {
    if (!order) return 0;
    if (order.pickingSummary && Number.isFinite(order.pickingSummary.progress)) {
      return Math.max(0, Math.min(100, Number(order.pickingSummary.progress || 0)));
    }
    const totalRequested = order.items.reduce((sum, item) => sum + getRequestedQuantity(item), 0);
    const totalPicked = order.items.reduce((sum, item) => sum + getPickedQuantity(item), 0);
    if (totalRequested <= 0) return 0;
    return Math.round((totalPicked / totalRequested) * 100);
  }, [order]);
  const hasActiveReservations = useMemo(() => (
    Boolean(order?.reservations.some((reservation) => String(reservation.status || '').toUpperCase() === 'ACTIVE'))
  ), [order?.reservations]);
  const activeReservations = useMemo(() => (
    order?.reservations.filter((reservation) => String(reservation.status || '').toUpperCase() === 'ACTIVE') || []
  ), [order?.reservations]);
  const releasedReservations = useMemo(() => (
    order?.reservations.filter((reservation) => String(reservation.status || '').toUpperCase() !== 'ACTIVE') || []
  ), [order?.reservations]);
  const isEcommerceProformaOpen = useMemo(() => {
    if (!order || order.salesChannel !== 'ECOMMERCE' || order.pickingSession?.id) {
      return false;
    }
    const status = String(order.status || '').toUpperCase();
    return status === 'PENDING' || status === 'WAITING_STOCK' || status === 'CONFIRMED';
  }, [order]);
  const pendingReservationItems = useMemo(() => (
    order?.items.filter((item) => getPendingReservationQuantity(item) > 0) || []
  ), [order?.items]);
  const hasPendingReservationItems = pendingReservationItems.length > 0;
  const shouldShowEcommerceProformaPanel = Boolean(
    order
    && isEcommerceProformaOpen
    && (
      hasPendingReservationItems
      || !hasActiveReservations
      || String(order.status || '').toUpperCase() !== 'CONFIRMED'
    ),
  );
  // Habilitar picking NO es bloqueante: basta >=1 reserva activa. Las lineas sin
  // reservar / sin stock quedan pendientes y editables en el panel de reserva, que
  // sigue disponible (isEcommerceProformaOpen) hasta iniciar la preparacion, para
  // reservar o agregar lo que falte mas tarde.
  const canConfirmMarketplaceGuide = useMemo(() => (
    Boolean(
      order
      && isEcommerceProformaOpen
      && hasActiveReservations
      && canUpdateOrderStatus
      && !updatingStatus
      && nextStates.includes('CONFIRMED'),
    )
  ), [canUpdateOrderStatus, hasActiveReservations, isEcommerceProformaOpen, nextStates, order, updatingStatus]);
  const canMarkMarketplaceGuideWithoutStock = useMemo(() => (
    Boolean(
      order
      && isEcommerceProformaOpen
      && canUpdateOrderStatus
      && !updatingStatus
      && nextStates.includes('WAITING_STOCK'),
    )
  ), [canUpdateOrderStatus, isEcommerceProformaOpen, nextStates, order, updatingStatus]);
  const canStartPickingFromDetail = useMemo(() => {
    if (!order || startingPicking) return false;
    if (!canStartPickingPermission) return false;
    if (!canCurrentUserOperatePickingByResponsibility) return false;
    if (order.pickingSession?.id) return false;
    if (!hasActiveReservations) return false;
    const status = String(order.status || '').toUpperCase();
    return status === 'CONFIRMED' || status === 'PREPARING' || status === 'WAITING_TRANSFER';
  }, [canCurrentUserOperatePickingByResponsibility, canStartPickingPermission, hasActiveReservations, order, startingPicking]);
  const isPickingFinalizedForDetail = useMemo(() => {
    if (!order?.pickingSession?.id) return false;
    const sessionStatus = String(order.pickingSession.status || '').toUpperCase();
    const orderStatus = String(order.status || '').toUpperCase();
    return sessionStatus === 'COMPLETED' && (orderStatus === 'READY' || orderStatus === 'DELIVERED');
  }, [order]);
  // Permite abrir el panel de proforma DURANTE el picking (ecommerce) para que el
  // cliente cambie de opinion en caliente. Bloqueado si el picking ya finalizo o el
  // pedido esta en estado final.
  const canEditDuringPicking = useMemo(() => {
    if (!order || order.salesChannel !== 'ECOMMERCE' || !order.pickingSession?.id) return false;
    if (!canUpdateOrderStatus || isPickingFinalizedForDetail) return false;
    const status = String(order.status || '').toUpperCase();
    return !['READY', 'DELIVERED', 'CANCELLED', 'RETURN_PENDING'].includes(status);
  }, [order, canUpdateOrderStatus, isPickingFinalizedForDetail]);
  const canCompletePickingFromDetail = useMemo(() => {
    if (!order || finishingPicking) return false;
    if (!canCompletePickingPermission) return false;
    if (!canCurrentUserOperatePickingByResponsibility) return false;
    if (!order.pickingSession?.id) return false;
    if (isPickingFinalizedForDetail) return false;
    const allPicked = order.items.every((item) => {
      const limit = getPickingItemLimit(item);
      const picked = getPickedQuantity(item);
      return limit > 0 ? picked >= limit : true;
    });
    return allPicked;
  }, [canCompletePickingPermission, canCurrentUserOperatePickingByResponsibility, finishingPicking, isPickingFinalizedForDetail, order]);
  // Paso activo del asistente de preparacion (mobile-first): Paso 1 = Reservar,
  // Paso 2 = Separar (picking). Se deriva del estado; sin estado propio nuevo.
  // Con pickingSession dominamos el Paso 2; "editingDuringPicking" vuelve al Paso 1
  // encima del picking para editar productos en caliente.
  const currentPrepStep: 1 | 2 = (order?.pickingSession?.id && !editingDuringPicking) ? 2 : 1;
  const isReturnPendingOrder = useMemo(() => String(order?.status || '').toUpperCase() === 'RETURN_PENDING', [order?.status]);
  const returnWorkflow = useMemo(() => {
    const rawWorkflow = order?.returnWorkflow || null;
    if (!order || !isReturnPendingOrder) {
      return rawWorkflow;
    }

    const currentUserFallback: AdminSimpleUser | null = user
      ? {
        id: Number(user.id),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      }
      : null;
    const effectiveResponsible = rawWorkflow?.responsible
      || rawWorkflow?.cancelledBy
      || order.dispenserUser
      || order.pickerUser
      || order.sellerUser
      || order.primaryResponsible
      || currentUserFallback
      || null;
    const effectiveCancelledBy = rawWorkflow?.cancelledBy || effectiveResponsible;
    const hasDelegation = Boolean(rawWorkflow?.delegatedBy);
    const rawAcceptanceStatus = String(rawWorkflow?.acceptanceStatus || '').trim().toUpperCase();
    const shouldTreatInitialReturnAsAccepted = Boolean(effectiveResponsible)
      && !hasDelegation
      && (!rawAcceptanceStatus || rawAcceptanceStatus === 'PENDING');
    const acceptanceStatus = shouldTreatInitialReturnAsAccepted
      ? 'ACCEPTED'
      : rawWorkflow?.acceptanceStatus || null;

    return {
      requestedAt: rawWorkflow?.requestedAt || order.updatedAt || null,
      returnedAt: rawWorkflow?.returnedAt || null,
      acceptanceStatus,
      acceptedAt: rawWorkflow?.acceptedAt || (shouldTreatInitialReturnAsAccepted ? rawWorkflow?.requestedAt || order.updatedAt || null : null),
      cancelledBy: effectiveCancelledBy,
      responsible: effectiveResponsible,
      delegatedBy: rawWorkflow?.delegatedBy || null,
    };
  }, [isReturnPendingOrder, order, user]);
  const isReturnResponsibilityAccepted = useMemo(
    () => String(returnWorkflow?.acceptanceStatus || '').toUpperCase() === 'ACCEPTED',
    [returnWorkflow?.acceptanceStatus],
  );
  const isCurrentUserReturnResponsible = useMemo(() => {
    const responsibleId = Number(returnWorkflow?.responsible?.id || 0);
    return Number.isInteger(currentUserId) && currentUserId > 0 && currentUserId === responsibleId;
  }, [currentUserId, returnWorkflow?.responsible?.id]);
  const isReturnDelegatedToCurrentUser = useMemo(() => {
    const delegatedById = Number(returnWorkflow?.delegatedBy?.id || 0);
    return isCurrentUserReturnResponsible && delegatedById > 0;
  }, [isCurrentUserReturnResponsible, returnWorkflow?.delegatedBy?.id]);
  const returnPendingReservations = useMemo(() => {
    if (!isReturnPendingOrder || !order) {
      return [] as AdminOrderReservation[];
    }
    return order.reservations.filter((reservation) => String(reservation.status || '').toUpperCase() === 'ACTIVE');
  }, [isReturnPendingOrder, order]);
  const returnPendingItems = useMemo(() => {
    if (!isReturnPendingOrder || !order) {
      return [] as Array<AdminOrderItem & { returnQuantity: number }>;
    }
    return order.items
      .map((item) => ({
        ...item,
        returnQuantity: Math.max(0, Number(item.pickedQuantity ?? item.picked ?? getPickedQuantity(item))),
      }))
      .filter((item) => item.returnQuantity > 0);
  }, [isReturnPendingOrder, order]);
  const returnPendingUnits = useMemo(
    () => returnPendingItems.reduce((sum, item) => sum + Math.max(0, Number(item.returnQuantity || 0)), 0),
    [returnPendingItems],
  );
  const returnPendingStoresCount = useMemo(() => {
    const storeIds = new Set<number>();
    for (const item of returnPendingItems) {
      const variantId = Number(item.variantId || 0);
      for (const reservation of returnPendingReservations) {
        const reservationVariantId = Number(reservation.variantId || 0);
        const reservationStoreId = Number(reservation.inventory?.storeId || reservation.inventoryId || 0);
        if (variantId > 0 && reservationVariantId === variantId && reservationStoreId > 0) {
          storeIds.add(reservationStoreId);
        }
      }
    }
    return storeIds.size;
  }, [returnPendingItems, returnPendingReservations]);
  const canAcceptReturnResponsibility = useMemo(() => {
    if (!returnResponsibilityManagementEnabled || !isReturnPendingOrder) {
      return false;
    }
    return isCurrentUserReturnResponsible && !isReturnResponsibilityAccepted;
  }, [
    isCurrentUserReturnResponsible,
    isReturnPendingOrder,
    isReturnResponsibilityAccepted,
    returnResponsibilityManagementEnabled,
  ]);
  const canDelegateReturnResponsibility = useMemo(() => {
    if (!returnResponsibilityManagementEnabled || !isReturnPendingOrder) {
      return false;
    }
    const responsibleId = Number(returnWorkflow?.responsible?.id || 0);
    const cancelledById = Number(returnWorkflow?.cancelledBy?.id || 0);
    if (!Number.isInteger(currentUserId) || currentUserId < 1) {
      return false;
    }
    return currentUserId === responsibleId || currentUserId === cancelledById;
  }, [
    currentUserId,
    isReturnPendingOrder,
    returnResponsibilityManagementEnabled,
    returnWorkflow?.cancelledBy?.id,
    returnWorkflow?.responsible?.id,
  ]);
  const canCompleteReturnAndCancel = useMemo(() => {
    if (!isReturnPendingOrder) {
      return false;
    }
    if (!returnResponsibilityManagementEnabled) {
      return Number.isInteger(currentUserId) && currentUserId > 0;
    }
    return isCurrentUserReturnResponsible && isReturnResponsibilityAccepted;
  }, [
    currentUserId,
    isCurrentUserReturnResponsible,
    isReturnPendingOrder,
    isReturnResponsibilityAccepted,
    returnResponsibilityManagementEnabled,
  ]);

  useEffect(() => {
    setPrintLayout(preferredPrintLayout);
  }, [preferredPrintLayout]);

  const loadOrder = useCallback(async () => {
    if (!hasLoadedOrderOnceRef.current) {
      setLoading(true);
    }
    setError('');
    try {
      const [orderResponse, pickingResponse] = await Promise.all([
        fetch(`/api/admin/orders/${orderId}`, {
          method: 'GET',
          cache: 'no-store',
        }).catch(() => null),
        fetch(`/api/admin/orders/${orderId}/picking`, {
          method: 'GET',
          cache: 'no-store',
        }).catch(() => null),
      ]);

      if (!orderResponse) {
        setError('No se pudo cargar el pedido.');
        setOrder(null);
        return;
      }

      const orderPayload = await orderResponse.json().catch(() => null);
      if (!orderResponse.ok) {
        const message = String((orderPayload as { error?: unknown; message?: unknown } | null)?.error
          || (orderPayload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo cargar el pedido.');
        setError(message);
        setOrder(null);
        return;
      }

      const normalizedOrder = normalizeOrderDetailResponse(orderPayload);
      if (!normalizedOrder) {
        setError('No se pudo normalizar el detalle del pedido.');
        setOrder(null);
        return;
      }

      let mergedOrder = normalizedOrder;
      if (pickingResponse && pickingResponse.ok) {
        const pickingPayload = await pickingResponse.json().catch(() => null);
        mergedOrder = normalizeOrderPickingResponse(pickingPayload, normalizedOrder) || normalizedOrder;
      }

      const normalizedMergedStatus = normalizeOrderStatus(mergedOrder.status) || 'PENDING';
      const mergedOrderWithNormalizedStatus = mergedOrder.status === normalizedMergedStatus
        ? mergedOrder
        : { ...mergedOrder, status: normalizedMergedStatus };

      setOrder(mergedOrderWithNormalizedStatus);
      const next = getNextStates(normalizedMergedStatus);
      setSelectedStatus(next.length > 0 ? next[0] : normalizedMergedStatus);
      setStatusNote('');
    } catch {
      setError('No se pudo cargar el pedido.');
      setOrder(null);
    } finally {
      if (!hasLoadedOrderOnceRef.current) {
        setLoading(false);
        hasLoadedOrderOnceRef.current = true;
      }
    }
  }, [orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const loadAssignableUsers = useCallback(async () => {
    setLoadingAssignUsers(true);
    setAssignUsersError('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudieron cargar usuarios.');
        setAssignUsersError(message);
        setAssignUsers([]);
        setAssignUserId(0);
        return;
      }

      const rows = normalizeAssignableUsers(payload);
      setAssignUsers(rows);
      setAssignUserId((current) => {
        if (current > 0 && rows.some((row) => row.id === current)) {
          return current;
        }
        return rows[0]?.id || 0;
      });
    } catch {
      setAssignUsersError('No se pudieron cargar usuarios.');
      setAssignUsers([]);
      setAssignUserId(0);
    } finally {
      setLoadingAssignUsers(false);
    }
  }, []);

  const loadOrderWorkflowSettings = useCallback(async () => {
    const response = await fetch('/api/admin/system-config/order-workflow', {
      method: 'GET',
      cache: 'no-store',
    }).catch(() => null);

    if (!response) {
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return;
    }

    const data = (payload as {
      data?: {
        returnResponsibilityManagementEnabled?: unknown;
        pickingResponsibilityFlowEnabled?: unknown;
        companyName?: unknown;
        companyAddress?: unknown;
        companyPhone?: unknown;
      };
    } | null)?.data;
    if (data && typeof data === 'object') {
      setReturnResponsibilityManagementEnabled(data.returnResponsibilityManagementEnabled !== false);
      if (typeof data.pickingResponsibilityFlowEnabled === 'boolean') {
        setPickingResponsibilityFlowEnabledSetting(data.pickingResponsibilityFlowEnabled);
      }
      setCompanyInfo({
        name: String(data.companyName || '').trim(),
        address: String(data.companyAddress || '').trim(),
        phone: String(data.companyPhone || '').trim(),
      });
    }
  }, []);

  useEffect(() => {
    if (!order || loadingAssignUsers || assignUsers.length > 0) {
      return;
    }
    void loadAssignableUsers();
  }, [assignUsers.length, loadAssignableUsers, loadingAssignUsers, order]);

  useEffect(() => {
    if (assignUsers.length === 0) {
      setReturnDelegateUserId(0);
      return;
    }
    setReturnDelegateUserId((current) => {
      if (current > 0 && assignUsers.some((userOption) => userOption.id === current)) {
        return current;
      }
      return assignUsers[0].id;
    });
  }, [assignUsers]);

  useEffect(() => {
    void loadOrderWorkflowSettings();
  }, [loadOrderWorkflowSettings]);

  useEffect(() => {
    if (!showAssignModal && !showReturnDelegateModal) {
      return undefined;
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (!assigningResponsible) {
        setShowAssignModal(false);
      }
      if (!delegatingReturn) {
        setShowReturnDelegateModal(false);
      }
    };

    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
    };
  }, [assigningResponsible, delegatingReturn, showAssignModal, showReturnDelegateModal]);

  useEffect(() => {
    if (!showOrderDetails) {
      return undefined;
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowOrderDetails(false);
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
    };
  }, [showOrderDetails]);

  useEffect(() => {
    if (!order || !shouldAutoPrint) {
      return;
    }
    if (lastAutoPrintedOrderId === order.id) {
      return;
    }
    setLastAutoPrintedOrderId(order.id);
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.print();
      }
    }, 250);
  }, [lastAutoPrintedOrderId, order, shouldAutoPrint]);

  function printOrder() {
    if (typeof window === 'undefined') return;
    window.print();
  }

  function openAssignModal() {
    if (!order) {
      return;
    }
    if (assignUsers.length === 0 && !loadingAssignUsers) {
      void loadAssignableUsers();
    }
    setShowAssignModal(true);
  }

  function closeAssignModal() {
    if (assigningResponsible) {
      return;
    }
    setShowAssignModal(false);
  }

  function openReturnDelegateModal() {
    if (!canDelegateReturnResponsibility) {
      showAlert('No tienes permisos para delegar esta devolucion.', 'warning');
      return;
    }
    if (assignUsers.length === 0 && !loadingAssignUsers) {
      void loadAssignableUsers();
    }
    setReturnDelegateNote('');
    setShowReturnDelegateModal(true);
  }

  function closeReturnDelegateModal() {
    if (delegatingReturn) {
      return;
    }
    setShowReturnDelegateModal(false);
  }


  // Cantidad separada efectiva = override optimista si existe, si no la del server.
  function getEffectivePicked(item: AdminOrderItem): number {
    const key = getPickingUpdateKey(item);
    if (key && key in pickedOverrides) {
      return Math.max(0, pickedOverrides[key]);
    }
    return getPickedQuantity(item);
  }

  async function startPickingFromDetail() {
    if (!canStartPickingPermission) {
      showAlert('No tienes permiso para iniciar picking.', 'error');
      return;
    }
    if (!canCurrentUserOperatePickingByResponsibility) {
      showAlert('No tienes responsabilidad asignada para iniciar este picking.', 'warning');
      return;
    }

    if (!order || !canStartPickingFromDetail || startingPicking) {
      return;
    }

    setStartingPicking(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/picking/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo iniciar picking.'), 'error');
        return;
      }
      showAlert('Picking iniciado correctamente.', 'success');
      await loadOrder();
    } catch {
      showAlert('No se pudo iniciar picking.', 'error');
    } finally {
      setStartingPicking(false);
    }
  }

  // Separa de una vez todo lo disponible del pedido (1 request atomico backend).
  // Pensado para tienda rapida: evita N clicks "+". Recarga tras el commit para
  // reflejar la verdad del server (limpia optimistas pendientes antes).
  async function pickAllAvailableFromDetail() {
    if (!order || pickingAll) {
      return;
    }
    if (!canUpdatePickingPermission) {
      showAlert('No tienes permiso para actualizar picking.', 'error');
      return;
    }
    if (!canCurrentUserOperatePickingByResponsibility) {
      showAlert('No tienes responsabilidad asignada para actualizar este picking.', 'warning');
      return;
    }

    setPickingAll(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/picking/pick-all`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo separar todo lo disponible.'), 'error');
        return;
      }
      setPickedOverrides({});
      await loadOrder();
      showAlert('Separado todo lo disponible.', 'success');
    } catch {
      showAlert('No se pudo separar todo lo disponible.', 'error');
    } finally {
      setPickingAll(false);
    }
  }

  // Escaneo (pistola/teclado/camara): busca la variante por SKU y separa +1.
  function handlePickingScan(rawCode: string) {
    const code = String(rawCode || '').trim().toLowerCase();
    if (!code) {
      return;
    }
    if (!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility) {
      showAlert('No tienes permiso para separar en este picking.', 'error');
      return;
    }
    const matches = detailPickingGroups.filter(
      (group) => String(group.representative.variant.sku || '').trim().toLowerCase() === code,
    );
    if (matches.length === 0) {
      showAlert(`SKU no está en el pedido: ${rawCode}`, 'warning');
      return;
    }
    // Producto unico: varias filas comparten SKU; separa la primera con pendiente.
    const target = matches.find((group) => {
      const picked = group.items.reduce((sum, item) => sum + getEffectivePicked(item), 0);
      return picked < group.limit;
    });
    if (!target) {
      showAlert('Ese producto ya está completo.', 'info');
      return;
    }
    markPickingGroupFromDetail(target, 'inc');
    const variant = target.representative.variant;
    showAlert(`+1 ${variant.productName} · ${variant.colorName}/${variant.sizeName}`, 'success', 1400);
  }

  // Seleccion multiple de grupos de picking + accion en lote.
  function toggleGroupSelection(key: string) {
    setSelectedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function clearGroupSelection() {
    setSelectedGroupKeys(new Set());
  }

  function separateSelectedGroups() {
    if (!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility) {
      showAlert('No tienes permiso para separar en este picking.', 'error');
      return;
    }
    const groups = detailPickingGroups.filter((group) => selectedGroupKeys.has(group.key));
    if (groups.length === 0) {
      return;
    }
    for (const group of groups) {
      markPickingGroupFromDetail(group, 'complete');
    }
    showAlert(`Separados ${groups.length} producto(s) seleccionado(s).`, 'success');
    clearGroupSelection();
  }

  const clearPickedOverrideIfEquals = useCallback((key: string, value: number) => {
    setPickedOverrides((prev) => {
      if (!(key in prev) || prev[key] !== value) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // Sincroniza UNA FILA (grupo) con el backend tras el debounce: postea SOLO las
  // lineas cuya cantidad separada cambio (PATCH absoluto), una sola vez por fila.
  // Toast "Actualizando…" al empezar + toast de confirmacion al terminar.
  const syncPickingGroup = useCallback(async (groupKey: string) => {
    const currentOrder = orderRef.current;
    if (!currentOrder || !Array.isArray(currentOrder.items)) {
      return;
    }
    if (pickingInFlightRef.current.has(groupKey)) {
      pickingDirtyRef.current.add(groupKey);
      return;
    }

    const groupItems = currentOrder.items.filter((item) => detailGroupKeyOf(item) === groupKey);
    const overrides = pickedOverridesRef.current;
    const pending = groupItems
      .map((item) => {
        const key = getPickingUpdateKey(item);
        const serverPicked = getPickedQuantity(item);
        const target = key && key in overrides ? overrides[key] : serverPicked;
        return { item, key, serverPicked, target };
      })
      .filter((entry) => entry.key && entry.target !== entry.serverPicked);

    if (pending.length === 0) {
      // Limpia overrides que ya coinciden con el server.
      for (const item of groupItems) {
        clearPickedOverrideIfEquals(getPickingUpdateKey(item), getPickedQuantity(item));
      }
      return;
    }

    pickingInFlightRef.current.add(groupKey);
    setSyncingGroupKeys((prev) => (prev.includes(groupKey) ? prev : [...prev, groupKey]));
    showAlert('Actualizando separacion…', 'info');

    let totalDelta = 0;
    let errorMsg = '';
    let lastPayload: PickingSyncPayload | null = null;
    try {
      for (const entry of pending) {
        const orderItemId = getOrderItemId(entry.item);
        const pickingItemId = getPickingItemId(entry.item);
        let endpoint = '';
        if (orderItemId > 0) {
          endpoint = `/api/admin/orders/${currentOrder.id}/picking/order-items/${orderItemId}`;
        } else if (pickingItemId > 0) {
          endpoint = `/api/admin/orders/picking/items/${pickingItemId}`;
        } else {
          errorMsg = 'No se pudo identificar el item de picking.';
          continue;
        }
        const response = await fetch(endpoint, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pickedQuantity: entry.target }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          errorMsg = String((payload as { error?: unknown; message?: unknown } | null)?.error
            || (payload as { error?: unknown; message?: unknown } | null)?.message
            || 'No se pudo actualizar item de picking.');
          continue;
        }
        totalDelta += entry.target - entry.serverPicked;
        // El controller envuelve el picking en { success, data, message }.
        const wrapped = payload as { data?: unknown } | null;
        lastPayload = (wrapped && typeof wrapped === 'object' && 'data' in wrapped
          ? wrapped.data
          : payload) as PickingSyncPayload;
      }

      // Respuesta parcial: si no cambio el estado del pedido ni esta activo el
      // flujo de responsabilidad, aplicamos el picking devuelto por el PATCH y
      // evitamos el GET completo del pedido (mas rapido en listas largas). En
      // transiciones de estado o multi-responsable recargamos todo por precision
      // (badges, contribuciones, reasignacion de responsable).
      const currentStatus = String(currentOrder.status || '').toUpperCase();
      const payloadStatus = String(lastPayload?.orderStatus || '').toUpperCase();
      const responsibilityOn = Boolean(lastPayload?.pickingResponsibility?.enabled);
      const canPatchLocally = !errorMsg
        && lastPayload
        && Array.isArray(lastPayload.items)
        && payloadStatus === currentStatus
        && !responsibilityOn;

      if (canPatchLocally) {
        const pickedByOrderItem = new Map<number, number>();
        for (const it of (lastPayload?.items ?? []) as Array<{ orderItemId?: unknown; pickedQuantity?: unknown }>) {
          const oiid = Number(it?.orderItemId || 0);
          if (oiid > 0) {
            pickedByOrderItem.set(oiid, Math.max(0, Number(it?.pickedQuantity || 0)));
          }
        }
        const nextProgress = Number(lastPayload?.summary?.progress);
        setOrder((prev) => {
          if (!prev) return prev;
          const items = prev.items.map((item) => {
            const oiid = getOrderItemId(item);
            if (oiid > 0 && pickedByOrderItem.has(oiid)) {
              const value = pickedByOrderItem.get(oiid)!;
              return { ...item, pickedQuantity: value, picked: value };
            }
            return item;
          });
          const pickingSummary = prev.pickingSummary && Number.isFinite(nextProgress)
            ? { ...prev.pickingSummary, progress: nextProgress }
            : prev.pickingSummary;
          return { ...prev, items, pickingSummary };
        });
      } else {
        await loadOrder();
      }

      for (const entry of pending) {
        clearPickedOverrideIfEquals(entry.key, entry.target);
      }

      if (errorMsg) {
        showAlert(errorMsg, 'error');
      } else if (totalDelta > 0) {
        showAlert(`Separadas ${totalDelta} unidad(es).`, 'success');
      } else if (totalDelta < 0) {
        showAlert(`Quitadas ${-totalDelta} unidad(es).`, 'success');
      } else {
        showAlert('Separacion actualizada.', 'success');
      }
    } catch {
      showAlert('No se pudo actualizar la separacion.', 'error');
      for (const entry of pending) {
        clearPickedOverrideIfEquals(entry.key, entry.target);
      }
    } finally {
      pickingInFlightRef.current.delete(groupKey);
      setSyncingGroupKeys((prev) => prev.filter((k) => k !== groupKey));
      if (pickingDirtyRef.current.has(groupKey)) {
        pickingDirtyRef.current.delete(groupKey);
        schedulePickingGroupSyncRef.current?.(groupKey);
      }
    }
  }, [loadOrder, showAlert, clearPickedOverrideIfEquals]);

  // Debounce POR FILA: cada +/- reinicia el timer; recien tras 1.5s inactiva postea.
  const schedulePickingGroupSync = useCallback((groupKey: string) => {
    if (!groupKey) {
      return;
    }
    const existing = pickingDebounceRef.current.get(groupKey);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      pickingDebounceRef.current.delete(groupKey);
      void syncPickingGroup(groupKey);
    }, PICKING_SYNC_DEBOUNCE_MS);
    pickingDebounceRef.current.set(groupKey, timer);
  }, [syncPickingGroup]);

  useEffect(() => {
    pickedOverridesRef.current = pickedOverrides;
  }, [pickedOverrides]);

  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  // Modo pantalla completa de picking: bloquea el scroll del fondo mientras esta
  // activo (el contenedor .pk-fs-target.is-fullscreen se muestra fijo a pantalla).
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.classList.toggle('pk-fullscreen-active', fullscreenPicking);
    return () => {
      document.body.classList.remove('pk-fullscreen-active');
    };
  }, [fullscreenPicking]);

  useEffect(() => {
    schedulePickingGroupSyncRef.current = schedulePickingGroupSync;
  }, [schedulePickingGroupSync]);

  useEffect(() => {
    const timers = pickingDebounceRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  // Aplica el cambio optimista a una linea (sin agendar; el grupo agenda una vez).
  function setPickedOverrideForItem(item: AdminOrderItem, nextPicked: number) {
    const key = getPickingUpdateKey(item);
    if (!key) {
      return;
    }
    const clamped = Math.max(0, Math.min(getPickingItemLimit(item), nextPicked));
    setPickedOverrides((prev) => ({ ...prev, [key]: clamped }));
  }

  function isGroupUpdatingDetail(group: DetailPickingGroup): boolean {
    return syncingGroupKeys.includes(group.key);
  }

  // Acciones sobre una fila agrupada: cambian la cantidad efectiva de la linea
  // subyacente (override optimista) y agendan UN solo debounce por fila.
  function markPickingGroupFromDetail(group: DetailPickingGroup, action: 'inc' | 'dec' | 'complete') {
    if (!canUpdatePickingPermission) {
      showAlert('No tienes permiso para actualizar picking.', 'error');
      return;
    }
    if (!canCurrentUserOperatePickingByResponsibility) {
      showAlert('No tienes responsabilidad asignada para actualizar este picking.', 'warning');
      return;
    }

    let changed = false;
    if (action === 'inc') {
      const target = group.items.find((item) => getEffectivePicked(item) < getPickingItemLimit(item));
      if (target) {
        setPickedOverrideForItem(target, getEffectivePicked(target) + 1);
        changed = true;
      }
    } else if (action === 'dec') {
      const target = [...group.items].reverse().find((item) => getEffectivePicked(item) > 0);
      if (target) {
        setPickedOverrideForItem(target, getEffectivePicked(target) - 1);
        changed = true;
      }
    } else {
      for (const item of group.items) {
        if (getEffectivePicked(item) < getPickingItemLimit(item)) {
          setPickedOverrideForItem(item, getPickingItemLimit(item));
          changed = true;
        }
      }
    }

    if (changed) {
      schedulePickingGroupSync(group.key);
    }
  }

  // Fija la cantidad separada del grupo de forma ABSOLUTA (input numerico), sin
  // pulsar + N veces. Distribuye el objetivo entre los items del grupo en una
  // sola pasada (llena en orden hasta el limite de cada uno) y agenda un solo
  // sync por fila. Evita el loop con estado stale de llamar 'inc' N veces.
  function setGroupPickedAbsolute(group: DetailPickingGroup, value: number) {
    if (!canUpdatePickingPermission) {
      showAlert('No tienes permiso para actualizar picking.', 'error');
      return;
    }
    if (!canCurrentUserOperatePickingByResponsibility) {
      showAlert('No tienes responsabilidad asignada para actualizar este picking.', 'warning');
      return;
    }
    const target = Math.max(0, Math.min(group.limit, Math.round(Number(value) || 0)));
    let remaining = target;
    const updates: Record<string, number> = {};
    let changed = false;
    for (const item of group.items) {
      const itemLimit = getPickingItemLimit(item);
      const assign = Math.max(0, Math.min(itemLimit, remaining));
      remaining -= assign;
      const key = getPickingUpdateKey(item);
      if (key && getEffectivePicked(item) !== assign) {
        updates[key] = assign;
        changed = true;
      }
    }
    if (!changed) {
      return;
    }
    setPickedOverrides((prev) => ({ ...prev, ...updates }));
    schedulePickingGroupSync(group.key);
  }

  async function completePickingFromDetail() {
    if (!canCompletePickingPermission) {
      showAlert('No tienes permiso para finalizar picking.', 'error');
      return;
    }
    if (!canCurrentUserOperatePickingByResponsibility) {
      showAlert('No tienes responsabilidad asignada para finalizar este picking.', 'warning');
      return;
    }

    if (!order || !canCompletePickingFromDetail || finishingPicking) {
      return;
    }

    setFinishingPicking(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/picking/complete`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo finalizar picking.'), 'error');
        return;
      }
      showAlert('Picking finalizado. El pedido quedo en estado READY.', 'success');
      await loadOrder();
    } catch {
      showAlert('No se pudo finalizar picking.', 'error');
    } finally {
      setFinishingPicking(false);
    }
  }

  async function deliverOrder() {
    if (!canUpdateOrderStatus) {
      showAlert('No tienes permiso para actualizar el estado de pedidos.', 'error');
      return;
    }

    if (!order || String(order.status).toUpperCase() !== 'READY' || deliveringOrder) {
      return;
    }

    const accepted = await confirm({
      title: 'Confirmar entrega',
      message: `Marcar ${order.code} como entregado?`,
      acceptText: 'Entregar',
      cancelText: 'Cancelar',
    });
    if (!accepted) {
      return;
    }

    setDeliveringOrder(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'DELIVERED', note: 'Pedido entregado' }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo marcar como entregado.'), 'error');
        return;
      }
      showAlert('Pedido entregado exitosamente.', 'success');
      await loadOrder();
    } catch {
      showAlert('No se pudo marcar como entregado.', 'error');
    } finally {
      setDeliveringOrder(false);
    }
  }

  async function submitAssignResponsible() {
    if (!order || assigningResponsible || !assignRole || assignUserId < 1) {
      return;
    }

    setAssigningResponsible(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/assign`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roleType: assignRole, userId: assignUserId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo asignar responsable.'), 'error');
        return;
      }
      showAlert('Responsable asignado exitosamente.', 'success');
      setShowAssignModal(false);
      await loadOrder();
    } catch {
      showAlert('No se pudo asignar responsable.', 'error');
    } finally {
      setAssigningResponsible(false);
    }
  }

  function getReturnItemLabel(item: AdminOrderItem & { returnQuantity: number }): string {
    return `${item.variant.productName} (${item.variant.colorName} - ${item.variant.sizeName})`;
  }

  function getReturnItemStoresLabel(item: AdminOrderItem & { returnQuantity: number }): string {
    const variantId = Number(item.variantId || 0);
    const stores = new Set<string>();
    for (const reservation of returnPendingReservations) {
      const reservationVariantId = Number(reservation.variantId || 0);
      const storeName = String(reservation.inventory?.storeName || '').trim();
      if (reservationVariantId === variantId && storeName) {
        stores.add(storeName);
      }
    }
    if (stores.size > 0) {
      return Array.from(stores.values()).join(', ');
    }
    return String(order?.sourceStore?.name || '-');
  }

  function getItemFulfillmentStoreName(item: AdminOrderItem): string {
    return String(item.fulfillmentStore?.name || order?.fulfillmentStore?.name || order?.sourceStore?.name || 'N/A');
  }

  function getReturnReservationStatusLabel(status: string): string {
    if (String(status || '').toUpperCase() === 'ACTIVE' && isReturnPendingOrder) {
      return 'Activa (pendiente devolucion)';
    }
    return getReservationStatusLabel(status);
  }

  async function acceptReturnResponsibility() {
    if (!order || !canAcceptReturnResponsibility || acceptingReturn) {
      return;
    }

    setAcceptingReturn(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/return-responsibility/accept`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo aceptar la devolucion.'), 'error');
        return;
      }

      showAlert('Responsabilidad de devolucion aceptada.', 'success');
      await loadOrder();
    } catch {
      showAlert('No se pudo aceptar la devolucion.', 'error');
    } finally {
      setAcceptingReturn(false);
    }
  }

  async function delegateReturnResponsibility() {
    if (!order || !canDelegateReturnResponsibility || delegatingReturn) {
      return;
    }

    if (!Number.isInteger(returnDelegateUserId) || returnDelegateUserId < 1) {
      showAlert('Debes seleccionar un usuario valido.', 'warning');
      return;
    }

    setDelegatingReturn(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/return-responsibility/delegate`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: returnDelegateUserId,
          note: returnDelegateNote.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo delegar la devolucion.'), 'error');
        return;
      }

      showAlert('Responsabilidad de devolucion delegada.', 'success');
      setReturnDelegateNote('');
      setShowReturnDelegateModal(false);
      await loadOrder();
    } catch {
      showAlert('No se pudo delegar la devolucion.', 'error');
    } finally {
      setDelegatingReturn(false);
    }
  }

  async function completeReturnAndCancel() {
    if (!order || !canCompleteReturnAndCancel || completingReturn) {
      return;
    }

    const accepted = await confirm({
      title: 'Confirmar devolucion',
      message: `Cerrar devolucion y finalizar cancelacion de ${order.code}?`,
      acceptText: 'Confirmar',
      cancelText: 'Cancelar',
    });
    if (!accepted) {
      return;
    }

    setCompletingReturn(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'CANCELLED',
          note: 'Devolucion de stock completada',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo finalizar la devolucion.'), 'error');
        return;
      }
      showAlert('Devolucion confirmada y cancelacion finalizada.', 'success');
      await loadOrder();
    } catch {
      showAlert('No se pudo finalizar la devolucion.', 'error');
    } finally {
      setCompletingReturn(false);
    }
  }

  async function updateStatus() {
    if (!canUpdateOrderStatus) {
      showAlert('No tienes permiso para actualizar el estado de pedidos.', 'error');
      return;
    }

    const currentOrderStatus = normalizeOrderStatus(order?.status);
    if (!order || !currentOrderStatus || selectedStatus === currentOrderStatus || updatingStatus) {
      return;
    }
    const previousStatus = String(currentOrderStatus || '').trim().toUpperCase();

    const accepted = await confirm({
      title: 'Actualizar estado',
      message: `Cambiar ${order.code} a ${getStatusLabel(selectedStatus)}?`,
      acceptText: 'Actualizar',
      cancelText: 'Cancelar',
    });
    if (!accepted) {
      return;
    }

    setUpdatingStatus(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: selectedStatus, note: statusNote.trim() || undefined }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo actualizar el estado.'), 'error');
        return;
      }

      const updatedStatus = String((payload as { data?: { status?: unknown } } | null)?.data?.status || selectedStatus).toUpperCase();
      if (updatedStatus === 'RETURN_PENDING') {
        showAlert('Pedido cancelado y marcado como pendiente de devolucion.', 'warning');
      } else if (
        updatedStatus === 'CANCELLED'
        && (selectedStatus === 'CANCELLED' || selectedStatus === 'RETURN_PENDING')
        && previousStatus !== 'RETURN_PENDING'
      ) {
        showAlert('Pedido cancelado y reservas liberadas automaticamente.', 'success');
      } else {
        showAlert('Estado actualizado correctamente.', 'success');
      }
      setStatusNote('');
      await loadOrder();
    } catch {
      showAlert('No se pudo actualizar el estado.', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function updateMarketplaceGuideStatus(status: AdminOrderStatus, note: string, successMessage: string) {
    if (!canUpdateOrderStatus) {
      showAlert('No tienes permiso para actualizar el estado de pedidos.', 'error');
      return;
    }
    if (!order || updatingStatus) {
      return;
    }

    const accepted = await confirm({
      title: status === 'CONFIRMED' ? 'Confirmar disponibilidad' : 'Marcar sin stock',
      message: status === 'CONFIRMED'
        ? `Confirmar disponibilidad de la proforma ${order.code}? Las reservas deben estar generadas desde las sugerencias.`
        : `Marcar la proforma ${order.code} como sin stock?`,
      acceptText: status === 'CONFIRMED' ? 'Confirmar' : 'Marcar',
      cancelText: 'Cancelar',
    });
    if (!accepted) {
      return;
    }

    setUpdatingStatus(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, note }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo actualizar la proforma ecommerce.'), 'error');
        return;
      }

      showAlert(successMessage, 'success');
      await loadOrder();
    } catch {
      showAlert('No se pudo actualizar la proforma ecommerce.', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  }

  if (loading) {
    return (
      <section className="admin-dashboard-grid order-detail-page-next">
        <article className="admin-card"><p>Cargando detalle del pedido...</p></article>
      </section>
    );
  }

  if (error || !order) {
    return (
      <section className="admin-dashboard-grid order-detail-page-next">
        <article className="admin-card">
          <h1>Detalle del pedido</h1>
          <p>{error || 'No se encontro el pedido.'}</p>
          <div className="admin-table-actions">
            <button type="button" className="admin-ghost-btn" onClick={() => router.push('/admin/orders/list')}>
              Volver al listado
            </button>
            <button type="button" className="admin-ghost-btn" onClick={loadOrder}>
              Reintentar
            </button>
          </div>
        </article>
      </section>
    );
  }

  const sourceStoreAddress = String(
    ((order.sourceStore as { address?: unknown } | null)?.address
      || companyInfo.address
      || 'Direccion no registrada'),
  );
  const sourceStorePhone = String(
    ((order.sourceStore as { phone?: unknown } | null)?.phone
      || companyInfo.phone
      || order.clientPhone
      || '-'),
  );
  const clientAddress = parseClientAddress(order.note);
  const productStoreColumnLabel = order.salesChannel === 'ECOMMERCE' && !hasActiveReservations
    ? 'Tienda ref.'
    : 'Reserva';

  const renderReservationTableRows = (rows: AdminOrderReservation[]) => (
    rows.map((reservation: AdminOrderReservation) => {
      const variantMeta = reservation.variantId ? reservationVariantLookup.get(reservation.variantId) : null;
      return (
        <tr key={reservation.id}>
          <td>{variantMeta?.productName || '-'}</td>
          <td>{variantMeta ? `${variantMeta.colorName} - ${variantMeta.sizeName}` : '-'}</td>
          <td>{reservation.inventory?.storeName || '-'}</td>
          <td>{reservation.quantity}</td>
          <td>{getReturnReservationStatusLabel(reservation.status)}</td>
          <td>{reservation.createdAt ? formatDateTime(reservation.createdAt) : '-'}</td>
        </tr>
      );
    })
  );

  const renderReservationMobileCards = (rows: AdminOrderReservation[]) => (
    rows.map((reservation) => {
      const variantMeta = reservation.variantId ? reservationVariantLookup.get(reservation.variantId) : null;
      return (
        <article key={`reservation-mobile-${reservation.id}`} className="order-detail-mobile-card-next">
          <div className="order-detail-mobile-card-head-next">
            <h4>{variantMeta?.productName || '-'}</h4>
            <span className="order-item-badge-next is-pending">{getReturnReservationStatusLabel(reservation.status)}</span>
          </div>
          <div className="order-detail-mobile-fields-next">
            <div className="order-detail-mobile-field-next">
              <span>Variante</span>
              <strong>{variantMeta ? `${variantMeta.colorName} - ${variantMeta.sizeName}` : '-'}</strong>
            </div>
            <div className="order-detail-mobile-field-next">
              <span>Tienda</span>
              <strong>{reservation.inventory?.storeName || '-'}</strong>
            </div>
            <div className="order-detail-mobile-field-next">
              <span>Cantidad reservada</span>
              <strong>{reservation.quantity}</strong>
            </div>
            <div className="order-detail-mobile-field-next">
              <span>Fecha</span>
              <strong>{reservation.createdAt ? formatDateTime(reservation.createdAt) : '-'}</strong>
            </div>
          </div>
        </article>
      );
    })
  );

  return (
    <section className={`admin-dashboard-grid order-detail-page-next print-layout-${printLayout}${isEcommerceProformaOpen ? ' order-detail-page-next--wide' : ''}`}>
      <div className="screen-content-next">
      <header className="order-detail-header-next">
        <div className="order-detail-header-left-next">
          <h1 className="order-detail-code-next">{order.code}</h1>
          <p className="order-detail-client-next">{order.clientName || 'Cliente'} - {order.clientEmail || '-'}</p>
        </div>
        <div className="order-detail-header-actions-next">
          {showHeaderMenu ? (
            <button
              type="button"
              className="order-detail-actions-backdrop-next"
              aria-label="Cerrar menu de acciones"
              onClick={() => setShowHeaderMenu(false)}
            />
          ) : null}
          <div className={`order-detail-actions-menu-next${showHeaderMenu ? ' is-open' : ''}`}>
            <button
              type="button"
              className="admin-ghost-btn order-detail-actions-trigger-next"
              aria-haspopup="true"
              aria-expanded={showHeaderMenu}
              onClick={() => setShowHeaderMenu((value) => !value)}
            >
              Acciones ▾
            </button>
            <div className="order-detail-actions-pop-next" role="menu">
              <div className="inventory-field order-detail-print-picker-next">
                <span>Formato</span>
                <AdminSelect
                  value={printLayout}
                  options={PRINT_LAYOUT_OPTIONS}
                  ariaLabel="Seleccionar formato de impresion"
                  onChange={setPrintLayout}
                />
              </div>
              <button
                type="button"
                className="admin-ghost-btn order-detail-header-btn-next"
                onClick={() => { setShowHeaderMenu(false); printOrder(); }}
              >
                Imprimir
              </button>
              <Link href="/admin/orders/list" className="admin-ghost-btn order-detail-header-btn-next">Volver al listado</Link>
              <Link href="/admin/orders/picking" className="admin-ghost-btn order-detail-header-btn-next">Tablero de picking</Link>
            </div>
          </div>
        </div>
      </header>

      <section className="order-detail-status-row-next">
        <article className="admin-card order-detail-summary-next">
          <h3>Estado Operativo</h3>

          <div className="order-detail-status-body-next">
            <div className="order-detail-status-info-next">
              <div className="orders-status-pill-next order-detail-status-pill-next" style={{ backgroundColor: getStatusColor(order.status) }}>
                {getStatusLabel(order.status)}
              </div>

              <div className="order-detail-progress-wrap-next">
                <div className="order-detail-progress-label-next">
                  <span>Progreso</span>
                  <strong>{getStatusProgress(order.status)}%</strong>
                </div>
                <div className="order-detail-progress-track-next">
                  <div className="order-detail-progress-fill-next" style={{ width: `${getStatusProgress(order.status)}%` }} />
                </div>
              </div>

              {nextStates.length === 0 ? (
                <div className="order-detail-transitions-next">
                  <p className="admin-muted-text">Pedido en estado final: no hay cambios de estado disponibles.</p>
                </div>
              ) : null}
            </div>

            {nextStates.length > 0 ? (
              <div className="order-status-update-next">
                {canUpdateOrderStatus ? (
                  !showStatusForm ? (
                    <button
                      type="button"
                      className="admin-primary-btn order-detail-action-btn-next"
                      onClick={() => setShowStatusForm(true)}
                    >
                      Cambiar estado
                    </button>
                  ) : (
                  <>
                    <p className="order-status-update-title-next">Actualizar estado</p>
                    <div className="inventory-field">
                      <span>Cambiar estado</span>
                      <AdminSelect
                        value={selectedStatus}
                        disabled={updatingStatus}
                        options={nextStates.map((status) => ({ value: status, label: getStatusLabel(status) }))}
                        ariaLabel="Cambiar estado de la orden"
                        onChange={setSelectedStatus}
                      />
                    </div>
                    <label className="inventory-field order-status-note-field-next">
                      <span>Nota (opcional)</span>
                      <textarea
                        rows={3}
                        value={statusNote}
                        disabled={updatingStatus}
                        placeholder="Motivo o comentario del cambio"
                        onChange={(event) => setStatusNote(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="admin-primary-btn order-detail-action-btn-next"
                      disabled={updatingStatus || selectedStatus === normalizedCurrentOrderStatus}
                      onClick={updateStatus}
                    >
                      {updatingStatus ? 'Actualizando...' : 'Cambiar estado'}
                    </button>
                  </>
                  )
                ) : (
                  <p className="admin-muted-text">No tienes permiso para actualizar el estado.</p>
                )}
              </div>
            ) : null}
          </div>

          {isReturnPendingOrder ? (
            <>
              <div className="order-detail-transitions-next">
                <p>Devolucion de inventario pendiente:</p>
                <div className="order-detail-info-row-next">
                  <label>Cancelado por:</label>
                  <span>
                    {`${returnWorkflow?.cancelledBy?.firstName || '-'} ${returnWorkflow?.cancelledBy?.lastName || ''}`.trim()}
                  </span>
                </div>
                {returnResponsibilityManagementEnabled ? (
                  <>
                    <div className="order-detail-info-row-next">
                      <label>Responsable:</label>
                      <span>
                        {`${returnWorkflow?.responsible?.firstName || '-'} ${returnWorkflow?.responsible?.lastName || ''}`.trim()}
                      </span>
                    </div>
                    <div className="order-detail-info-row-next">
                      <label>Aceptacion:</label>
                      <span>{isReturnResponsibilityAccepted ? 'Aceptada' : 'Pendiente'}</span>
                    </div>
                  </>
                ) : null}
                <div className="order-detail-info-row-next">
                  <label>Solicitado:</label>
                  <span>{returnWorkflow?.requestedAt ? formatDateTime(returnWorkflow.requestedAt) : '-'}</span>
                </div>
                {returnResponsibilityManagementEnabled && returnWorkflow?.acceptedAt ? (
                  <div className="order-detail-info-row-next">
                    <label>Aceptado:</label>
                    <span>{formatDateTime(returnWorkflow.acceptedAt)}</span>
                  </div>
                ) : null}
              </div>

              <div className="order-detail-return-task-next">
                <h4>{isCurrentUserReturnResponsible ? 'Tienes una devolucion pendiente en este pedido' : 'Esta devolucion esta pendiente de ejecucion'}</h4>
                <p>
                  {!returnResponsibilityManagementEnabled
                    ? 'Gestion de responsabilidades desactivada. Confirma cuando termine el retorno fisico.'
                    : !isCurrentUserReturnResponsible
                      ? 'Revisa el responsable asignado para coordinar la devolucion.'
                      : !isReturnResponsibilityAccepted
                        ? 'Acepta la responsabilidad antes de confirmar la devolucion.'
                        : returnPendingUnits <= 0
                          ? 'No hay unidades separadas fisicamente. Puedes confirmar devolucion para liberar reservas.'
                          : 'Devuelve los items listados y luego confirma la devolucion para cerrar la cancelacion.'}
                </p>
                <div className="order-detail-return-metrics-next">
                  <span>{returnPendingUnits} unidades</span>
                  <span>{returnPendingItems.length} items</span>
                  <span>{returnPendingStoresCount} tiendas</span>
                </div>
                {isReturnDelegatedToCurrentUser && !isReturnResponsibilityAccepted ? (
                  <p className="order-detail-return-warning-next">
                    Esta devolucion fue delegada a tu usuario y esta pendiente de aceptacion.
                  </p>
                ) : null}
                {returnPendingItems.length > 0 ? (
                  <div className="order-detail-return-list-next">
                    {returnPendingItems.map((item) => (
                      <div key={`return-item-${item.id}`} className="order-detail-return-item-next">
                        <div>
                          <strong>{getReturnItemLabel(item)}</strong>
                          <small>Tienda: {getReturnItemStoresLabel(item)}</small>
                        </div>
                        <span>{item.returnQuantity} und.</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="admin-muted-text">No hay productos separados por devolver.</p>
                )}
              </div>

              <div className="admin-table-actions order-detail-return-actions-next">
                {canAcceptReturnResponsibility ? (
                  <button
                    type="button"
                    className="admin-ghost-btn order-detail-action-btn-next"
                    disabled={acceptingReturn}
                    onClick={acceptReturnResponsibility}
                  >
                    {acceptingReturn ? 'Aceptando...' : 'Aceptar responsabilidad'}
                  </button>
                ) : null}

                {canDelegateReturnResponsibility ? (
                  <button type="button" className="admin-ghost-btn order-detail-action-btn-next" onClick={openReturnDelegateModal}>
                    Delegar responsabilidad
                  </button>
                ) : null}

                {canCompleteReturnAndCancel ? (
                  <button
                    type="button"
                    className="admin-primary-btn order-detail-action-btn-next"
                    disabled={completingReturn}
                    onClick={completeReturnAndCancel}
                  >
                    {completingReturn ? 'Confirmando...' : 'Confirmar devolucion'}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </article>
      </section>

      <article className="admin-card order-detail-meta-next">
        <div className="order-detail-meta-summary-next">
          <div className="order-detail-meta-chip-next"><span>Total</span><strong>{formatMoney(order.total)}</strong></div>
          <div className="order-detail-meta-chip-next"><span>Canal</span><strong>{getChannelLabel(order.salesChannel)}</strong></div>
          <div className="order-detail-meta-chip-next"><span>Fecha</span><strong>{formatDateTime(order.createdAt)}</strong></div>
          <div className="order-detail-meta-chip-next"><span>Responsable</span><strong>{order.primaryResponsible ? `${order.primaryResponsible.firstName} ${order.primaryResponsible.lastName}`.trim() : 'Sin asignar'}</strong></div>
          <div className="order-detail-meta-chip-next"><span>Fulfillment</span><strong>{order.fulfillmentStore?.name || order.sourceStore?.name || 'N/A'}</strong></div>
          <button
            type="button"
            className="admin-ghost-btn order-detail-meta-toggle-next"
            onClick={() => setShowOrderDetails(true)}
          >
            Ver detalle
          </button>
        </div>
      </article>

      <div
        className={`order-detail-drawer-root${showOrderDetails ? ' is-open' : ''}`}
        aria-hidden={!showOrderDetails}
      >
        <button
          type="button"
          className="order-detail-drawer-backdrop"
          aria-label="Cerrar detalle"
          tabIndex={showOrderDetails ? 0 : -1}
          onClick={() => setShowOrderDetails(false)}
        />
        <aside
          className="order-detail-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Detalle del pedido"
        >
          <header className="order-detail-drawer-head">
            <h3>Detalle del pedido</h3>
            <button
              type="button"
              className="order-detail-drawer-close"
              aria-label="Cerrar"
              onClick={() => setShowOrderDetails(false)}
            >
              ✕
            </button>
          </header>
          <div className="order-detail-drawer-body">
        <section className="order-detail-grid-next">
        {order.status === 'DELIVERED' ? (
          <article className="admin-card order-return-card">
            <AdminOrderReturnPanel
              orderId={order.id}
              orderCode={order.code}
              items={order.items}
              onChange={loadOrder}
            />
          </article>
        ) : null}
        <article className="admin-card">
          <h3>Informacion del Pedido</h3>
          <div className="order-detail-info-list-next">
            <div className="order-detail-info-row-next"><label>Codigo:</label><span>{order.code}</span></div>
            <div className="order-detail-info-row-next"><label>Canal:</label><span>{getChannelLabel(order.salesChannel)}</span></div>
            <div className="order-detail-info-row-next"><label>Subtotal:</label><span>{formatMoney(order.subtotal)}</span></div>
            <div className="order-detail-info-row-next"><label>Impuesto (18%):</label><span>{formatMoney(order.igvAmount)}</span></div>
            <div className="order-detail-info-row-next order-detail-info-total-next"><label>Total:</label><span>{formatMoney(order.total)}</span></div>
            <div className="order-detail-info-row-next"><label>Fecha:</label><span>{formatDateTime(order.createdAt)}</span></div>
            <div className="order-detail-info-row-next"><label>Actualizado:</label><span>{formatDateTime(order.updatedAt)}</span></div>
          </div>
        </article>

        <article className="admin-card">
          <h3>Pago</h3>
            <div className="order-detail-info-list-next">
              <div className="order-detail-info-row-next"><label>Metodo:</label><span>{parsePaymentMethod(order.note)}</span></div>
              <div className="order-detail-info-row-next"><label>Referencia:</label><span>{parsePaymentReference(order.note)}</span></div>
            <div className="order-detail-info-row-next"><label>Monto recibido:</label><span>{parsePaymentAmountLabel(order.note, ['Monto recibido', 'Monto pagado', 'Pagado'])}</span></div>
            <div className="order-detail-info-row-next"><label>Vuelto:</label><span>{parsePaymentAmountLabel(order.note, ['Vuelto', 'Cambio'])}</span></div>
              <div className="order-detail-info-row-next"><label>Nota:</label><span>{getDisplayNote(order.note)}</span></div>
            </div>
          </article>

        <article className="admin-card">
          <h3>Responsables Operativos</h3>
          <div className="order-detail-info-list-next">
            <div className="order-detail-info-row-next">
              <label>Vendedor:</label>
              <span>{order.sellerUser ? `${order.sellerUser.firstName} ${order.sellerUser.lastName}`.trim() : 'No asignado'}</span>
            </div>
            <div className="order-detail-info-row-next">
              <label>Picker:</label>
              <span>{order.pickerUser ? `${order.pickerUser.firstName} ${order.pickerUser.lastName}`.trim() : 'No asignado'}</span>
            </div>
            <div className="order-detail-info-row-next">
              <label>Despachador:</label>
              <span>{order.dispenserUser ? `${order.dispenserUser.firstName} ${order.dispenserUser.lastName}`.trim() : 'No asignado'}</span>
            </div>
            <div className="order-detail-info-row-next">
              <label>Asignado picking:</label>
              <span>{order.pickingSession?.assignedUser ? `${order.pickingSession.assignedUser.firstName} ${order.pickingSession.assignedUser.lastName}`.trim() : 'No asignado'}</span>
            </div>
            <div className="order-detail-info-row-next">
              <label>Responsable principal:</label>
              <span>{order.primaryResponsible ? `${order.primaryResponsible.firstName} ${order.primaryResponsible.lastName}`.trim() : 'Sin asignar'}</span>
            </div>
          </div>
          <div className="admin-table-actions">
            <button type="button" className="admin-ghost-btn order-detail-action-btn-next" onClick={openAssignModal}>
              Asignar responsable
            </button>
          </div>
        </article>

        <article className="admin-card">
          <h3>Ubicaciones</h3>
          <div className="order-detail-info-list-next">
            <div className="order-detail-info-row-next"><label>Tienda Origen:</label><span>{order.sourceStore?.name || 'N/A'}</span></div>
            <div className="order-detail-info-row-next"><label>Tienda Fulfillment:</label><span>{order.fulfillmentStore?.name || 'N/A'}</span></div>
          </div>
        </article>
        </section>
          </div>
        </aside>
      </div>

      <nav className="order-detail-tabs-next" role="tablist" aria-label="Secciones del pedido">
        <button
          type="button"
          role="tab"
          className={`order-detail-tab-next${activeTab === 'prep' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('prep')}
        >
          Preparacion
        </button>
        <button
          type="button"
          role="tab"
          className={`order-detail-tab-next${activeTab === 'products' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          Productos
        </button>
        <button
          type="button"
          role="tab"
          className={`order-detail-tab-next${activeTab === 'reservations' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('reservations')}
        >
          Reservas
        </button>
        <button
          type="button"
          role="tab"
          className={`order-detail-tab-next${activeTab === 'history' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Historial
        </button>
      </nav>

      {activeTab === 'products' ? (
      <article className="admin-card">
        <h3>Productos de la Orden</h3>
        <div className="admin-table-wrap order-detail-desktop-only-next">
          <table className="admin-table order-detail-table-next">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Variante</th>
                <th>{productStoreColumnLabel}</th>
                <th>Cantidad</th>
                <th>Precio Unit.</th>
                <th>Subtotal</th>
                <th>Separado</th>
                <th>Estado pick</th>
              </tr>
            </thead>
            <tbody>
              {order.items.length === 0 ? (
                <tr>
                  <td colSpan={8}>No hay items en el pedido.</td>
                </tr>
              ) : (
                order.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.variant.productName}</td>
                    <td>{item.variant.colorName} - {item.variant.sizeName}</td>
                    <td>{getItemFulfillmentStoreName(item)}</td>
                    <td>{item.quantity}</td>
                    <td>{formatMoney(item.unitPrice)}</td>
                    <td>{formatMoney(item.subtotal)}</td>
                    <td>{getPickedQuantity(item)}/{item.quantity}</td>
                    <td>
                      <span className={`order-item-badge-next ${getPickingStatusClass(item)}`}>{getPickingStatusLabel(item)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="order-detail-mobile-cards-next order-detail-mobile-only-next">
          {order.items.length === 0 ? (
            <p className="admin-muted-text">No hay items en el pedido.</p>
          ) : (
            order.items.map((item, index) => (
              <article key={`order-item-mobile-${getOrderItemId(item) || item.id}-${index}`} className="order-detail-mobile-card-next">
                <div className="order-detail-mobile-card-head-next">
                  <h4>{item.variant.productName || 'Producto'}</h4>
                  <span className={`order-item-badge-next ${getPickingStatusClass(item)}`}>{getPickingStatusLabel(item)}</span>
                </div>
                <div className="order-detail-mobile-fields-next">
                  <div className="order-detail-mobile-field-next">
                    <span>Variante</span>
                    <strong>{item.variant.colorName || '-'} - {item.variant.sizeName || '-'}</strong>
                  </div>
                  <div className="order-detail-mobile-field-next">
                    <span>{productStoreColumnLabel}</span>
                    <strong>{getItemFulfillmentStoreName(item)}</strong>
                  </div>
                  <div className="order-detail-mobile-field-next">
                    <span>Cantidad</span>
                    <strong>{item.quantity}</strong>
                  </div>
                  <div className="order-detail-mobile-field-next">
                    <span>Precio Unit.</span>
                    <strong>{formatMoney(item.unitPrice)}</strong>
                  </div>
                  <div className="order-detail-mobile-field-next">
                    <span>Subtotal</span>
                    <strong>{formatMoney(item.subtotal)}</strong>
                  </div>
                  <div className="order-detail-mobile-field-next">
                    <span>Separado</span>
                    <strong>{getPickedQuantity(item)}/{item.quantity}</strong>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </article>
      ) : null}

      {activeTab === 'prep' ? (
      <>
      <div className="prep-stepper" role="list" aria-label="Pasos de preparacion">
        <div
          className={`prep-step${currentPrepStep === 1 ? ' is-active' : ''}${order.pickingSession?.id ? ' is-done' : ''}`}
          role="listitem"
        >
          <span className="prep-step-num">{order.pickingSession?.id ? '✓' : '1'}</span>
          <span className="prep-step-label">Reservar</span>
        </div>
        <span className="prep-step-sep" aria-hidden />
        <div
          className={`prep-step${currentPrepStep === 2 ? ' is-active' : ''}${['READY', 'DELIVERED'].includes(String(order.status || '').toUpperCase()) ? ' is-done' : ''}`}
          role="listitem"
        >
          <span className="prep-step-num">{['READY', 'DELIVERED'].includes(String(order.status || '').toUpperCase()) ? '✓' : '2'}</span>
          <span className="prep-step-label">Separar</span>
        </div>
      </div>
      {(isEcommerceProformaOpen || editingDuringPicking) ? (
        <>
          {editingDuringPicking ? (
            <div className="admin-table-actions order-detail-hot-edit-banner-next">
              <span className="admin-muted-text">
                Estas en el Paso 1 (Reservar) durante el picking. Agrega o quita productos y reserva su stock; al terminar, vuelve a Separar.
              </span>
              <button
                type="button"
                className="admin-primary-btn order-detail-action-btn-next"
                onClick={() => { void loadOrder().then(() => setEditingDuringPicking(false)); }}
              >
                Volver a Separar (Paso 2)
              </button>
            </div>
          ) : null}
          <EcommerceFulfillmentPanel order={order} canEdit={canUpdateOrderStatus} onReload={loadOrder} />
        </>
      ) : null}
      <article className={`admin-card pk-fs-target${fullscreenPicking ? ' is-fullscreen' : ''}`}>
        <div className="pk-fs-head">
          <h3>{currentPrepStep === 1 ? 'Continuar preparacion' : 'Separar (Picking)'}</h3>
          {order.pickingSession && !isPickingFinalizedForDetail ? (
            <button
              type="button"
              className={`admin-ghost-btn order-detail-action-btn-next${fullscreenPicking ? ' is-active' : ''}`}
              onClick={() => setFullscreenPicking((value) => !value)}
            >
              {fullscreenPicking ? 'Salir de pantalla completa' : 'Pantalla completa'}
            </button>
          ) : null}
        </div>
        {shouldShowEcommerceProformaPanel ? (
          <>
            <div className="admin-table-actions">
              <button
                type="button"
                className="admin-primary-btn order-detail-action-btn-next"
                disabled={!canConfirmMarketplaceGuide}
                onClick={() => void updateMarketplaceGuideStatus(
                  'CONFIRMED',
                  'Disponibilidad confirmada. Reservas listas para picking.',
                  'Disponibilidad confirmada. Ya puedes iniciar preparacion.',
                )}
              >
                {updatingStatus ? 'Confirmando...' : 'Confirmar disponibilidad'}
              </button>
              <button
                type="button"
                className="admin-ghost-btn order-detail-action-btn-next"
                disabled={!canMarkMarketplaceGuideWithoutStock}
                onClick={() => void updateMarketplaceGuideStatus(
                  'WAITING_STOCK',
                  'Proforma ecommerce marcada sin stock disponible.',
                  'Proforma marcada como sin stock.',
                )}
              >
                Marcar sin stock
              </button>
            </div>
            {!canUpdateOrderStatus ? (
              <p className="admin-muted-text">No tienes permiso para confirmar disponibilidad.</p>
            ) : null}
            {String(order.status || '').toUpperCase() === 'CONFIRMED' && !hasActiveReservations ? (
              <p className="admin-muted-text">La proforma figura confirmada, pero no tiene reservas activas. Genera reservas antes de iniciar preparacion.</p>
            ) : null}
            {hasPendingReservationItems ? (
              <p className="admin-muted-text">
                Quedan {pendingReservationItems.length} linea(s) sin reservar. Puedes habilitar el picking igual:
                seguiran pendientes y podras reservar o agregar lo que falte mas tarde desde el panel de reserva.
              </p>
            ) : null}
          </>
        ) : canStartPickingFromDetail ? (
          <>
            <p className="admin-muted-text">La orden aun no tiene picking iniciado.</p>
            <div className="admin-table-actions">
              <button
                type="button"
                className="admin-primary-btn order-detail-action-btn-next"
                disabled={startingPicking}
                onClick={startPickingFromDetail}
              >
                {startingPicking ? 'Iniciando...' : 'Iniciar preparacion'}
              </button>
            </div>
          </>
        ) : order.pickingSession ? (
          <>
            {canEditDuringPicking && !editingDuringPicking ? (
              <div className="admin-table-actions">
                <button
                  type="button"
                  className="admin-ghost-btn order-detail-action-btn-next"
                  onClick={() => setEditingDuringPicking(true)}
                >
                  ← Volver a reservar
                </button>
              </div>
            ) : null}
            <div className="order-detail-progress-wrap-next">
              <div className="order-detail-progress-label-next">
                <span>Progreso de picking</span>
                <strong>{pickingProgress}%</strong>
              </div>
              <div className="order-detail-progress-track-next">
                <div className="order-detail-progress-fill-next" style={{ width: `${pickingProgress}%` }} />
              </div>
            </div>
            {!isPickingFinalizedForDetail ? (
              <div className="admin-table-actions order-detail-pickall-next">
                <button
                  type="button"
                  className="admin-primary-btn order-detail-action-btn-next"
                  disabled={pickingAll || pickingProgress >= 100 || !canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility}
                  onClick={pickAllAvailableFromDetail}
                >
                  {pickingAll ? 'Separando…' : 'Separar todo lo disponible'}
                </button>
                <button
                  type="button"
                  className={`admin-ghost-btn order-detail-action-btn-next${scanMode ? ' is-active' : ''}`}
                  disabled={!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility}
                  onClick={() => setScanMode((value) => !value)}
                >
                  {scanMode ? 'Cerrar escaneo' : 'Modo escaneo'}
                </button>
              </div>
            ) : null}
            {scanMode && !isPickingFinalizedForDetail ? (
              <PickingScanPanel
                onScan={handlePickingScan}
                disabled={!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility}
              />
            ) : null}
            {selectedGroupKeys.size > 0 && !isPickingFinalizedForDetail ? (
              <div className="admin-table-actions pk-batch-bar">
                <span className="admin-muted-text">{selectedGroupKeys.size} seleccionado(s)</span>
                <button
                  type="button"
                  className="admin-primary-btn order-detail-action-btn-next"
                  disabled={!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility}
                  onClick={separateSelectedGroups}
                >
                  Separar seleccionados
                </button>
                <button type="button" className="admin-ghost-btn order-detail-action-btn-next" onClick={clearGroupSelection}>
                  Limpiar
                </button>
              </div>
            ) : null}
            <div className="admin-table-wrap order-detail-desktop-only-next">
              <table className="admin-table order-detail-table-next">
                <thead>
                  <tr>
                    <th className="pk-select-col">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos"
                        checked={detailPickingGroups.length > 0 && selectedGroupKeys.size === detailPickingGroups.length}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedGroupKeys(new Set(detailPickingGroups.map((group) => group.key)));
                          } else {
                            clearGroupSelection();
                          }
                        }}
                      />
                    </th>
                    <th>Producto</th>
                    <th>Variante</th>
                    <th>Solicitada</th>
                    <th>Separada</th>
                    <th>Faltante</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {detailPickingGroups.length === 0 ? (
                    <tr>
                      <td colSpan={8}>No hay items para picking.</td>
                    </tr>
                  ) : (
                    detailPickingGroups.map((group) => {
                      const representative = group.representative;
                      const isSyncing = isGroupUpdatingDetail(group);
                      const picked = group.items.reduce((sum, item) => sum + getEffectivePicked(item), 0);
                      const missing = Math.max(0, group.requested - picked);
                      const status = detailPickingStatusFromCounts(picked, group.requested);
                      return (
                        <tr key={`picking-${group.key}`}>
                          <td className="pk-select-col">
                            <input
                              type="checkbox"
                              aria-label="Seleccionar producto"
                              checked={selectedGroupKeys.has(group.key)}
                              onChange={() => toggleGroupSelection(group.key)}
                            />
                          </td>
                          <td>{representative.variant.productName}</td>
                          <td>
                            {representative.variant.colorName} - {representative.variant.sizeName}
                            {group.items.length > 1 ? (
                              <small className="admin-muted-text"> ({group.items.length} lineas)</small>
                            ) : null}
                          </td>
                          <td>{group.requested}</td>
                          <td>
                            <input
                              className="pk-picked-input"
                              type="text"
                              inputMode="numeric"
                              aria-label="Cantidad separada"
                              value={picked}
                              disabled={!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility || isSyncing}
                              onChange={(event) => setGroupPickedAbsolute(group, Number(event.target.value.replace(/\D/g, '')) || 0)}
                            />
                          </td>
                          <td>{missing}</td>
                          <td>
                            <span className={`order-item-badge-next ${detailPickingStatusClass(status)}`}>{detailPickingStatusLabel(status)}</span>
                          </td>
                          <td>
                            <div className="order-detail-pick-actions-next">
                              <button
                                type="button"
                                className="order-detail-pick-step-next"
                                onClick={() => markPickingGroupFromDetail(group, 'dec')}
                                disabled={!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility || isSyncing || picked <= 0}
                              >
                                -
                              </button>
                              <button
                                type="button"
                                className="order-detail-pick-step-next"
                                onClick={() => markPickingGroupFromDetail(group, 'inc')}
                                disabled={!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility || isSyncing || picked >= group.limit}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                className="order-detail-pick-complete-next"
                                onClick={() => markPickingGroupFromDetail(group, 'complete')}
                                disabled={!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility || isSyncing || picked >= group.limit}
                              >
                                Completar
                              </button>
                              {isSyncing ? <span className="ff-spinner ff-spinner-sm order-detail-pick-spin-next" aria-hidden /> : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="pk-board order-detail-mobile-only-next">
              {detailPickingGroups.length === 0 ? (
                <p className="admin-muted-text">No hay items para picking.</p>
              ) : (
                detailPickingProductSections.map((section) => (
                  <PickingMobileProductSection
                    key={`picking-mobile-${section.key}`}
                    section={section}
                    getEffectivePicked={getEffectivePicked}
                    isGroupUpdatingDetail={isGroupUpdatingDetail}
                    onMark={markPickingGroupFromDetail}
                    onSetAbsolute={setGroupPickedAbsolute}
                    canUpdate={canUpdatePickingPermission}
                    canOperate={canCurrentUserOperatePickingByResponsibility}
                    selectedKeys={selectedGroupKeys}
                    onToggleSelect={toggleGroupSelection}
                  />
                ))
              )}
            </div>
            {!isPickingFinalizedForDetail ? (
              <div className="admin-table-actions">
                <button
                  type="button"
                  className="admin-primary-btn order-detail-action-btn-next"
                  disabled={!canCompletePickingFromDetail || finishingPicking}
                  onClick={completePickingFromDetail}
                >
                  {finishingPicking ? 'Finalizando...' : 'Finalizar preparacion'}
                </button>
              </div>
            ) : (
              <p className="picking-finished-note-next">Preparacion finalizada. Pedido listo para entrega.</p>
            )}
            {!canUpdatePickingPermission ? (
              <p className="admin-muted-text">Sin permiso picking.update: no puedes ajustar cantidades separadas.</p>
            ) : null}
            {isPickingResponsibilityFlowEnabled && !canCurrentUserOperatePickingByResponsibility ? (
              <p className="admin-muted-text">Configuracion operativa activa: este picking requiere responsabilidad asignada para operar.</p>
            ) : null}
            {!canCompletePickingPermission ? (
              <p className="admin-muted-text">Sin permiso picking.complete para finalizar la preparacion.</p>
            ) : null}

            {/* Barra inferior sticky (movil): progreso + accion primaria en zona del pulgar */}
            {!isPickingFinalizedForDetail ? (
              <div className="pk-sticky-bar">
                <div className="pk-sticky-info">
                  <strong>{pickingProgress}%</strong>
                  <small>separado</small>
                </div>
                {pickingProgress >= 100 ? (
                  <button
                    type="button"
                    className="admin-primary-btn"
                    disabled={!canCompletePickingFromDetail || finishingPicking}
                    onClick={completePickingFromDetail}
                  >
                    {finishingPicking ? 'Finalizando…' : 'Finalizar'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="admin-primary-btn"
                    disabled={pickingAll || !canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility}
                    onClick={pickAllAvailableFromDetail}
                  >
                    {pickingAll ? 'Separando…' : 'Separar todo'}
                  </button>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p className="admin-muted-text">
              {hasActiveReservations
                ? 'La orden aun no tiene picking iniciado.'
                : 'La orden no tiene reservas activas para iniciar preparacion.'}
            </p>
            {!canStartPickingPermission ? (
              <p className="admin-muted-text">Sin permiso picking.start para iniciar la preparacion.</p>
            ) : null}
            {isPickingResponsibilityFlowEnabled && canStartPickingPermission && !canCurrentUserOperatePickingByResponsibility ? (
              <p className="admin-muted-text">Configuracion operativa activa: necesitas responsabilidad asignada para iniciar picking.</p>
            ) : null}
          </>
        )}
      </article>
      {String(order.status || '').toUpperCase() === 'READY' ? (
        <article className="admin-card">
          <div className="admin-table-actions">
            <button
              type="button"
              className="admin-primary-btn order-detail-action-btn-next"
              disabled={deliveringOrder || !canUpdateOrderStatus}
              onClick={deliverOrder}
            >
              {deliveringOrder ? 'Entregando...' : 'Entregar pedido'}
            </button>
          </div>
        </article>
      ) : null}
      </>
      ) : null}

      {activeTab === 'reservations' ? (
      <article className="admin-card">
        <h3>Reservas de Stock</h3>
        {activeReservations.length === 0 ? (
          <p className="admin-muted-text">No hay reservas activas.</p>
        ) : (
          <>
            <div className="admin-table-wrap order-detail-desktop-only-next">
              <table className="admin-table order-detail-table-next">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Variante</th>
                    <th>Tienda</th>
                    <th>Cantidad reservada</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>{renderReservationTableRows(activeReservations)}</tbody>
              </table>
            </div>
            <div className="order-detail-mobile-cards-next order-detail-mobile-only-next">
              {renderReservationMobileCards(activeReservations)}
            </div>
          </>
        )}

        {releasedReservations.length > 0 ? (
          <details className="order-detail-reservations-history-next">
            <summary>Ver histórico liberado ({releasedReservations.length})</summary>
            <div className="admin-table-wrap order-detail-desktop-only-next">
              <table className="admin-table order-detail-table-next">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Variante</th>
                    <th>Tienda</th>
                    <th>Cantidad reservada</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>{renderReservationTableRows(releasedReservations)}</tbody>
              </table>
            </div>
            <div className="order-detail-mobile-cards-next order-detail-mobile-only-next">
              {renderReservationMobileCards(releasedReservations)}
            </div>
          </details>
        ) : null}
      </article>
      ) : null}

      {activeTab === 'history' ? (
      <article className="admin-card">
        <h3>Timeline de la Orden</h3>
        <div className="order-detail-timeline-next">
          {timelineEvents.map((event, index) => (
            <div key={`${event.label}-${event.date ? event.date.getTime() : index}`} className="order-detail-timeline-item-next">
              <div className="order-detail-timeline-dot-next" />
              <div className="order-detail-timeline-content-next">
                <strong>{event.label}</strong>
                <p>{event.description}</p>
                <small>{formatDateTimeFromDate(event.date)}</small>
              </div>
            </div>
          ))}
        </div>
      </article>
      ) : null}

      {showAssignModal ? (
        <div className="admin-modal-overlay" role="presentation" onClick={closeAssignModal}>
          <article className="admin-modal-dialog order-detail-modal-next" onClick={(event) => event.stopPropagation()}>
            <header className="admin-modal-head-next">
              <div>
                <h3>Asignar responsable</h3>
                <p>Selecciona rol y usuario para este pedido.</p>
              </div>
              <button
                type="button"
                className="admin-modal-close-next"
                aria-label="Cerrar modal de asignacion"
                disabled={assigningResponsible}
                onClick={closeAssignModal}
              >
                x
              </button>
            </header>

            <form
              className="admin-modal-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitAssignResponsible();
              }}
            >
              <div className="admin-field-block">
                <span>Rol</span>
                <AdminSelect
                  value={assignRole}
                  disabled={assigningResponsible}
                  options={ASSIGN_ROLE_OPTIONS}
                  ariaLabel="Seleccionar rol responsable"
                  onChange={setAssignRole}
                />
              </div>

              <div className="admin-field-block">
                <span>Usuario</span>
                <AdminSelect
                  value={String(assignUserId)}
                  disabled={assigningResponsible || loadingAssignUsers || assignUsers.length === 0}
                  options={assignUsers.length === 0
                    ? [{ value: '0', label: 'Sin usuarios disponibles' }]
                    : assignUsers.map((userOption) => ({
                      value: String(userOption.id),
                      label: `${userOption.firstName} ${userOption.lastName}`.trim() || userOption.email,
                    }))}
                  ariaLabel="Seleccionar usuario responsable"
                  onChange={(nextValue) => setAssignUserId(Number(nextValue) || 0)}
                />
              </div>

              {assignUsersError ? <p className="admin-modal-error">{assignUsersError}</p> : null}

              <div className="admin-modal-actions">
                <button type="button" className="admin-ghost-btn order-detail-modal-cancel-next" disabled={assigningResponsible} onClick={closeAssignModal}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="admin-ghost-btn order-detail-modal-reload-next"
                  disabled={assigningResponsible || loadingAssignUsers}
                  onClick={() => void loadAssignableUsers()}
                >
                  {loadingAssignUsers ? 'Cargando...' : 'Recargar'}
                </button>
                <button
                  type="submit"
                  className="admin-primary-btn order-detail-modal-submit-next"
                  disabled={assigningResponsible || assignUserId < 1 || loadingAssignUsers}
                >
                  {assigningResponsible ? 'Asignando...' : 'Asignar'}
                </button>
              </div>
            </form>
          </article>
        </div>
      ) : null}

      {showReturnDelegateModal ? (
        <div className="admin-modal-overlay" role="presentation" onClick={closeReturnDelegateModal}>
          <article className="admin-modal-dialog order-detail-modal-next" onClick={(event) => event.stopPropagation()}>
            <header className="admin-modal-head-next">
              <div>
                <h3>Delegar responsabilidad de devolucion</h3>
                <p>Asignar a otro usuario para continuar la devolucion de stock.</p>
              </div>
              <button
                type="button"
                className="admin-modal-close-next"
                aria-label="Cerrar modal de delegacion"
                disabled={delegatingReturn}
                onClick={closeReturnDelegateModal}
              >
                x
              </button>
            </header>

            <form
              className="admin-modal-form"
              onSubmit={(event) => {
                event.preventDefault();
                void delegateReturnResponsibility();
              }}
            >
              <div className="admin-field-block">
                <span>Usuario</span>
                <AdminSelect
                  value={String(returnDelegateUserId)}
                  disabled={delegatingReturn || loadingAssignUsers || assignUsers.length === 0}
                  options={assignUsers.length === 0
                    ? [{ value: '0', label: 'Sin usuarios disponibles' }]
                    : assignUsers.map((userOption) => ({
                      value: String(userOption.id),
                      label: `${userOption.firstName} ${userOption.lastName}`.trim() || userOption.email,
                    }))}
                  ariaLabel="Seleccionar usuario delegado"
                  onChange={(nextValue) => setReturnDelegateUserId(Number(nextValue) || 0)}
                />
              </div>

              <label>
                <span>Nota</span>
                <textarea
                  rows={3}
                  value={returnDelegateNote}
                  placeholder="Motivo de delegacion (opcional)"
                  disabled={delegatingReturn}
                  onChange={(event) => setReturnDelegateNote(event.target.value)}
                />
              </label>

              {assignUsersError ? <p className="admin-modal-error">{assignUsersError}</p> : null}

              <div className="admin-modal-actions">
                <button type="button" className="admin-ghost-btn order-detail-modal-cancel-next" disabled={delegatingReturn} onClick={closeReturnDelegateModal}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="admin-ghost-btn order-detail-modal-reload-next"
                  disabled={delegatingReturn || loadingAssignUsers}
                  onClick={() => void loadAssignableUsers()}
                >
                  {loadingAssignUsers ? 'Cargando...' : 'Recargar'}
                </button>
                <button
                  type="submit"
                  className="admin-primary-btn order-detail-modal-submit-next"
                  disabled={delegatingReturn || returnDelegateUserId < 1 || loadingAssignUsers}
                >
                  {delegatingReturn ? 'Delegando...' : 'Delegar'}
                </button>
              </div>
            </form>
          </article>
        </div>
      ) : null}
      </div>
      <div className={`print-content-next print-content-layout-${printLayout}`}>
        <section className="print-sheet-next print-sheet-invoice-next">
          <div className="invoice-header-next">
            <div className="invoice-brand-next">
              <h2>{order.sourceStore?.name || 'HYDRA COMPANY'}</h2>
              <p>{sourceStoreAddress}</p>
              <p>Telefono: {sourceStorePhone}</p>
            </div>
            <div className="invoice-meta-next">
              <p className="invoice-doc-next">{printDocLabel}</p>
              <p className="invoice-code-next">{order.code}</p>
              <p>{formatDateTime(order.createdAt)}</p>
            </div>
          </div>

          <div className="invoice-client-next">
            <div><strong>Cliente:</strong> {order.clientName || 'Cliente varios'}</div>
            {order.clientEmail ? <div><strong>Correo:</strong> {order.clientEmail}</div> : null}
            <div><strong>Telefono:</strong> {order.clientPhone || '-'}</div>
            {clientAddress ? <div><strong>Direccion:</strong> {clientAddress}</div> : null}
            <div><strong>Canal:</strong> {getChannelLabel(order.salesChannel)}</div>
          </div>

          <table className="invoice-items-next">
            <thead>
              <tr>
                <th>Cantidad</th>
                <th>Unidad</th>
                <th>Descripcion</th>
                <th>P. Unit.</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={`print-invoice-item-${getOrderItemId(item) || index}`}>
                  <td>{item.quantity}</td>
                  <td>UND</td>
                  <td>{getPrintItemDescription(item)}</td>
                  <td>{formatMoney(item.unitPrice)}</td>
                  <td>{formatMoney(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="invoice-summary-next">
            <div>
              <span>Subtotal</span>
              <strong>{formatMoney(order.subtotal)}</strong>
            </div>
            <div>
              <span>IGV (18%)</span>
              <strong>{formatMoney(order.igvAmount)}</strong>
            </div>
            <div className="total-next">
              <span>Total</span>
              <strong>{formatMoney(order.total)}</strong>
            </div>
          </div>

          <div className="invoice-footer-next">
            <p>Metodo de pago: {parsePaymentMethod(order.note)}</p>
            <p>Referencia: {parsePaymentReference(order.note)}</p>
            <p>Monto recibido: {parsePaymentAmountLabel(order.note, ['Monto recibido', 'Monto pagado', 'Pagado'])}</p>
            <p>Vuelto: {parsePaymentAmountLabel(order.note, ['Vuelto', 'Cambio'])}</p>
            <p>Gracias por su compra.</p>
          </div>
        </section>

        <section className="print-sheet-next print-sheet-ticket-next">
          <div className="ticket-header-next">
            <p className="ticket-title-next">{order.sourceStore?.name || 'HYDRA COMPANY'}</p>
            <p>{sourceStoreAddress}</p>
            <p>{formatDateTime(order.createdAt)}</p>
            <p>{printDocShort}: {order.code}</p>
          </div>

          <div className="ticket-divider-next" />

          <div className="ticket-client-next">
            <p>Cliente: {order.clientName || 'Cliente varios'}</p>
            {order.clientPhone ? <p>Telefono: {order.clientPhone}</p> : null}
            {clientAddress ? <p>Direccion: {clientAddress}</p> : null}
            <p>Canal: {getChannelLabel(order.salesChannel)}</p>
          </div>

          <div className="ticket-divider-next" />

          <div className="ticket-items-next">
            {order.items.map((item, index) => (
              <div key={`print-ticket-item-${getOrderItemId(item) || index}`} className="ticket-item-next">
                <p className="ticket-item-name-next">{getPrintItemDescription(item)}</p>
                <p className="ticket-item-line-next">
                  {item.quantity} x {formatMoney(item.unitPrice)} = {formatMoney(item.subtotal)}
                </p>
              </div>
            ))}
          </div>

          <div className="ticket-divider-next" />

          <div className="ticket-summary-next">
            <p>
              <span>Subtotal</span>
              <strong>{formatMoney(order.subtotal)}</strong>
            </p>
            <p>
              <span>IGV</span>
              <strong>{formatMoney(order.igvAmount)}</strong>
            </p>
            <p className="ticket-total-next">
              <span>TOTAL</span>
              <strong>{formatMoney(order.total)}</strong>
            </p>
          </div>

          <div className="ticket-divider-next" />

          <div className="ticket-footer-next">
            <p>Pago: {parsePaymentMethod(order.note)}</p>
            <p>Ref: {parsePaymentReference(order.note)}</p>
            <p>Recibido: {parsePaymentAmountLabel(order.note, ['Monto recibido', 'Monto pagado', 'Pagado'])}</p>
            <p>Vuelto: {parsePaymentAmountLabel(order.note, ['Vuelto', 'Cambio'])}</p>
            <p>Gracias por su compra</p>
          </div>
        </section>
      </div>
    </section>
  );
}
