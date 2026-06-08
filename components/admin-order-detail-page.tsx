'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { AdminSelect, AdminSelectOption } from '@/components/admin-select';
import { useAdminUi } from '@/components/admin-ui-provider';
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
  const match = String(note || '').match(/Metodo de pago:\s*([^|]+)/i);
  return match?.[1]?.trim() || 'No especificado';
}

function parsePaymentReference(note: string): string {
  const match = String(note || '').match(/Ref:\s*([^|]+)/i);
  return match?.[1]?.trim() || '-';
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
  const [lastAutoPrintedOrderId, setLastAutoPrintedOrderId] = useState<number | null>(null);
  const [startingPicking, setStartingPicking] = useState(false);
  const [finishingPicking, setFinishingPicking] = useState(false);
  const [deliveringOrder, setDeliveringOrder] = useState(false);
  const [updatingPickingItemIds, setUpdatingPickingItemIds] = useState<string[]>([]);
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
  const hasLoadedOrderOnceRef = useRef(false);

  const canUpdateOrderStatus = hasPermission('orders.status.update');
  const canStartPickingPermission = hasPermission('picking.start');
  const canUpdatePickingPermission = hasPermission('picking.update');
  const canCompletePickingPermission = hasPermission('picking.complete');
  const shouldAutoPrint = searchParams.get('print') === '1';
  const preferredPrintLayout: PrintLayout = searchParams.get('style') === 'ticket' ? 'ticket' : 'invoice';
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
  const canStartPickingFromDetail = useMemo(() => {
    if (!order || startingPicking) return false;
    if (!canStartPickingPermission) return false;
    if (!canCurrentUserOperatePickingByResponsibility) return false;
    if (order.pickingSession?.id) return false;
    const status = String(order.status || '').toUpperCase();
    return status === 'CONFIRMED' || status === 'PREPARING' || status === 'WAITING_TRANSFER';
  }, [canCurrentUserOperatePickingByResponsibility, canStartPickingPermission, order, startingPicking]);
  const isPickingFinalizedForDetail = useMemo(() => {
    if (!order?.pickingSession?.id) return false;
    const sessionStatus = String(order.pickingSession.status || '').toUpperCase();
    const orderStatus = String(order.status || '').toUpperCase();
    return sessionStatus === 'COMPLETED' && (orderStatus === 'READY' || orderStatus === 'DELIVERED');
  }, [order]);
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
      };
    } | null)?.data;
    if (data && typeof data === 'object') {
      setReturnResponsibilityManagementEnabled(data.returnResponsibilityManagementEnabled !== false);
      if (typeof data.pickingResponsibilityFlowEnabled === 'boolean') {
        setPickingResponsibilityFlowEnabledSetting(data.pickingResponsibilityFlowEnabled);
      }
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

  function getPickingGroupItems(item: AdminOrderItem): AdminOrderItem[] {
    if (!order || !Array.isArray(order.items) || order.items.length === 0) {
      return [item];
    }

    const pickingItemId = getPickingItemId(item);
    if (pickingItemId > 0) {
      const groupedByPickingItemId = order.items.filter((candidate) => getPickingItemId(candidate) === pickingItemId);
      if (groupedByPickingItemId.length > 0) {
        return groupedByPickingItemId;
      }
    }

    const variantId = getNormalizedVariantId(item);
    if (variantId > 0) {
      const groupedByVariantId = order.items.filter((candidate) => getNormalizedVariantId(candidate) === variantId);
      if (groupedByVariantId.length > 0) {
        return groupedByVariantId;
      }
    }

    return [item];
  }

  function resolveNextPickingUpdateQuantity(item: AdminOrderItem, action: 'inc' | 'dec' | 'complete'): number {
    const currentRowQuantity = getPickedQuantity(item);
    const rowLimit = getPickingItemLimit(item);

    let targetRowQuantity = currentRowQuantity;
    if (action === 'inc') targetRowQuantity = Math.min(rowLimit, currentRowQuantity + 1);
    if (action === 'dec') targetRowQuantity = Math.max(0, currentRowQuantity - 1);
    if (action === 'complete') targetRowQuantity = rowLimit;

    const orderItemId = getOrderItemId(item);
    if (orderItemId > 0) {
      return targetRowQuantity;
    }

    const groupedItems = getPickingGroupItems(item);
    if (groupedItems.length <= 1) {
      return targetRowQuantity;
    }

    const groupCurrentTotal = groupedItems.reduce((sum, groupItem) => sum + getPickedQuantity(groupItem), 0);
    const groupLimitTotal = groupedItems.reduce((sum, groupItem) => sum + getPickingItemLimit(groupItem), 0);
    const delta = targetRowQuantity - currentRowQuantity;
    const nextGroupTotal = groupCurrentTotal + delta;

    return Math.max(0, Math.min(groupLimitTotal, nextGroupTotal));
  }

  function isUpdatingPickingItem(item: AdminOrderItem): boolean {
    const updateKey = getPickingUpdateKey(item);
    return updateKey.length > 0 && updatingPickingItemIds.includes(updateKey);
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

  async function markPickingItemFromDetail(item: AdminOrderItem, action: 'inc' | 'dec' | 'complete') {
    if (!canUpdatePickingPermission) {
      showAlert('No tienes permiso para actualizar picking.', 'error');
      return;
    }
    if (!canCurrentUserOperatePickingByResponsibility) {
      showAlert('No tienes responsabilidad asignada para actualizar este picking.', 'warning');
      return;
    }

    if (!order) {
      return;
    }

    const updateKey = getPickingUpdateKey(item);
    if (!updateKey || isUpdatingPickingItem(item)) {
      return;
    }

    const currentPicked = getPickedQuantity(item);
    const nextPicked = resolveNextPickingUpdateQuantity(item, action);

    if (nextPicked === currentPicked) {
      return;
    }

    const orderItemId = getOrderItemId(item);
    const pickingItemId = getPickingItemId(item);

    let endpoint = '';
    if (orderItemId > 0) {
      endpoint = `/api/admin/orders/${order.id}/picking/order-items/${orderItemId}`;
    } else if (pickingItemId > 0) {
      endpoint = `/api/admin/orders/picking/items/${pickingItemId}`;
    } else {
      showAlert('No se pudo identificar el item de picking.', 'error');
      return;
    }

    setUpdatingPickingItemIds((current) => [...current, updateKey]);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pickedQuantity: nextPicked }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo actualizar item de picking.'), 'error');
        return;
      }

      await loadOrder();
    } catch {
      showAlert('No se pudo actualizar item de picking.', 'error');
    } finally {
      setUpdatingPickingItemIds((current) => current.filter((key) => key !== updateKey));
    }
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
      || 'Direccion no registrada'),
  );
  const sourceStorePhone = String(
    ((order.sourceStore as { phone?: unknown } | null)?.phone
      || order.clientPhone
      || '-'),
  );

  return (
    <section className={`admin-dashboard-grid order-detail-page-next print-layout-${printLayout}`}>
      <div className="screen-content-next">
      <header className="order-detail-header-next">
        <div className="order-detail-header-left-next">
          <h1 className="order-detail-code-next">{order.code}</h1>
          <p className="order-detail-client-next">{order.clientName || 'Cliente'} - {order.clientEmail || '-'}</p>
        </div>
        <div className="order-detail-header-actions-next">
          <div className="inventory-field order-detail-print-picker-next">
            <span>Formato</span>
            <AdminSelect
              value={printLayout}
              options={PRINT_LAYOUT_OPTIONS}
              ariaLabel="Seleccionar formato de impresion"
              onChange={setPrintLayout}
            />
          </div>
          <button type="button" className="admin-ghost-btn order-detail-header-btn-next" onClick={printOrder}>Imprimir</button>
          <Link href="/admin/orders/list" className="admin-ghost-btn order-detail-header-btn-next">Volver al listado</Link>
          <Link href="/admin/orders/picking" className="admin-ghost-btn order-detail-header-btn-next">Tablero de picking</Link>
        </div>
      </header>

      <section className="order-detail-grid-next">
        <article className="admin-card order-detail-summary-next">
          <h3>Estado Operativo</h3>
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

          <div className="order-detail-transitions-next">
            <p>Transiciones disponibles:</p>
            {nextStates.length > 0 ? (
              <div className="order-detail-transitions-list-next">
                {nextStates.map((status) => (
                  <span key={status} className="order-detail-transition-pill-next">{getStatusLabel(status)}</span>
                ))}
              </div>
            ) : (
              <p className="admin-muted-text">Sin transiciones disponibles</p>
            )}
          </div>

          <div className="order-status-update-next">
            <div className="inventory-field">
              <span>Cambiar estado</span>
              <AdminSelect
                value={selectedStatus}
                disabled={!canUpdateOrderStatus || nextStates.length === 0}
                options={(nextStates.length > 0 ? nextStates : (normalizedCurrentOrderStatus ? [normalizedCurrentOrderStatus] : []))
                  .map((status) => ({ value: status, label: getStatusLabel(status) }))}
                ariaLabel="Cambiar estado de orden"
                onChange={setSelectedStatus}
              />
            </div>
            <label className="inventory-field order-status-note-field-next">
              <span>Nota (opcional)</span>
              <textarea
                rows={2}
                value={statusNote}
                disabled={!canUpdateOrderStatus || updatingStatus}
                placeholder="Motivo o comentario del cambio"
                onChange={(event) => setStatusNote(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="admin-primary-btn order-detail-action-btn-next"
              disabled={!canUpdateOrderStatus || updatingStatus || selectedStatus === normalizedCurrentOrderStatus || nextStates.length === 0}
              onClick={updateStatus}
            >
              {updatingStatus ? 'Actualizando...' : 'Cambiar Estado'}
            </button>
            {!canUpdateOrderStatus ? (
              <p className="admin-muted-text">No tienes permiso para actualizar estado.</p>
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
              <div className="order-detail-info-row-next"><label>Nota:</label><span>{order.note || '-'}</span></div>
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

      <article className="admin-card">
        <h3>Productos de la Orden</h3>
        <div className="admin-table-wrap order-detail-desktop-only-next">
          <table className="admin-table order-detail-table-next">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Variante</th>
                <th>Reserva</th>
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
                    <span>Reserva</span>
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

      <article className="admin-card">
        <h3>Picking Operativo</h3>
        {canStartPickingFromDetail ? (
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
            <div className="order-detail-progress-wrap-next">
              <div className="order-detail-progress-label-next">
                <span>Progreso de picking</span>
                <strong>{pickingProgress}%</strong>
              </div>
              <div className="order-detail-progress-track-next">
                <div className="order-detail-progress-fill-next" style={{ width: `${pickingProgress}%` }} />
              </div>
            </div>
            <div className="admin-table-wrap order-detail-desktop-only-next">
              <table className="admin-table order-detail-table-next">
                <thead>
                  <tr>
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
                  {order.items.length === 0 ? (
                    <tr>
                      <td colSpan={7}>No hay items para picking.</td>
                    </tr>
                  ) : (
                    order.items.map((item) => {
                      const picked = getPickedQuantity(item);
                      const requested = getRequestedQuantity(item);
                      const limit = getPickingItemLimit(item);
                      const missing = Math.max(0, requested - picked);
                      const isUpdating = isUpdatingPickingItem(item);
                      return (
                        <tr key={`picking-${item.id}`}>
                          <td>{item.variant.productName}</td>
                          <td>{item.variant.colorName} - {item.variant.sizeName}</td>
                          <td>{requested}</td>
                          <td>{picked}</td>
                          <td>{missing}</td>
                          <td>
                            <span className={`order-item-badge-next ${getPickingStatusClass(item)}`}>{getPickingStatusLabel(item)}</span>
                          </td>
                          <td>
                            <div className="order-detail-pick-actions-next">
                              <button
                                type="button"
                                className="order-detail-pick-step-next"
                                onClick={() => void markPickingItemFromDetail(item, 'dec')}
                                disabled={!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility || isUpdating || picked <= 0}
                              >
                                -
                              </button>
                              <button
                                type="button"
                                className="order-detail-pick-step-next"
                                onClick={() => void markPickingItemFromDetail(item, 'inc')}
                                disabled={!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility || isUpdating || picked >= limit}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                className="order-detail-pick-complete-next"
                                onClick={() => void markPickingItemFromDetail(item, 'complete')}
                                disabled={!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility || isUpdating || picked >= limit}
                              >
                                Completar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="order-detail-mobile-cards-next order-detail-mobile-only-next">
              {order.items.length === 0 ? (
                <p className="admin-muted-text">No hay items para picking.</p>
              ) : (
                order.items.map((item, index) => {
                  const picked = getPickedQuantity(item);
                  const requested = getRequestedQuantity(item);
                  const limit = getPickingItemLimit(item);
                  const missing = Math.max(0, requested - picked);
                  const isUpdating = isUpdatingPickingItem(item);
                  return (
                    <article key={`picking-item-mobile-${getPickingUpdateKey(item) || index}`} className="order-detail-mobile-card-next">
                      <div className="order-detail-mobile-card-head-next">
                        <h4>{item.variant.productName || '-'}</h4>
                        <span className={`order-item-badge-next ${getPickingStatusClass(item)}`}>{getPickingStatusLabel(item)}</span>
                      </div>
                      <div className="order-detail-mobile-fields-next">
                        <div className="order-detail-mobile-field-next">
                          <span>Variante</span>
                          <strong>{item.variant.colorName || '-'} - {item.variant.sizeName || '-'}</strong>
                        </div>
                        <div className="order-detail-mobile-field-next">
                          <span>Solicitada</span>
                          <strong>{requested}</strong>
                        </div>
                        <div className="order-detail-mobile-field-next">
                          <span>Separada</span>
                          <strong>{picked}</strong>
                        </div>
                        <div className="order-detail-mobile-field-next">
                          <span>Faltante</span>
                          <strong>{missing}</strong>
                        </div>
                      </div>
                      <div className="order-detail-mobile-pick-actions-next">
                        <button
                          type="button"
                          className="order-detail-pick-step-next"
                          onClick={() => void markPickingItemFromDetail(item, 'dec')}
                          disabled={!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility || isUpdating || picked <= 0}
                        >
                          -
                        </button>
                        <button
                          type="button"
                          className="order-detail-pick-step-next"
                          onClick={() => void markPickingItemFromDetail(item, 'inc')}
                          disabled={!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility || isUpdating || picked >= limit}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="order-detail-pick-complete-next"
                          onClick={() => void markPickingItemFromDetail(item, 'complete')}
                          disabled={!canUpdatePickingPermission || !canCurrentUserOperatePickingByResponsibility || isUpdating || picked >= limit}
                        >
                          Completar
                        </button>
                      </div>
                    </article>
                  );
                })
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
          </>
        ) : (
          <>
            <p className="admin-muted-text">La orden aun no tiene picking iniciado.</p>
            {!canStartPickingPermission ? (
              <p className="admin-muted-text">Sin permiso picking.start para iniciar la preparacion.</p>
            ) : null}
            {isPickingResponsibilityFlowEnabled && canStartPickingPermission && !canCurrentUserOperatePickingByResponsibility ? (
              <p className="admin-muted-text">Configuracion operativa activa: necesitas responsabilidad asignada para iniciar picking.</p>
            ) : null}
          </>
        )}
      </article>

      <article className="admin-card">
        <h3>Reservas de Stock</h3>
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
            <tbody>
              {order.reservations.length === 0 ? (
                <tr>
                  <td colSpan={6}>No hay reservas asociadas.</td>
                </tr>
              ) : (
                order.reservations.map((reservation: AdminOrderReservation) => {
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
              )}
            </tbody>
          </table>
        </div>
        <div className="order-detail-mobile-cards-next order-detail-mobile-only-next">
          {order.reservations.length === 0 ? (
            <p className="admin-muted-text">No hay reservas asociadas.</p>
          ) : (
            order.reservations.map((reservation) => {
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
          )}
        </div>
      </article>

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
              <p className="invoice-doc-next">BOLETA DE VENTA</p>
              <p className="invoice-code-next">{order.code}</p>
              <p>{formatDateTime(order.createdAt)}</p>
            </div>
          </div>

          <div className="invoice-client-next">
            <div><strong>Cliente:</strong> {order.clientName || 'Cliente varios'}</div>
            <div><strong>Correo:</strong> {order.clientEmail || '-'}</div>
            <div><strong>Telefono:</strong> {order.clientPhone || '-'}</div>
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
            <p>Boleta: {order.code}</p>
          </div>

          <div className="ticket-divider-next" />

          <div className="ticket-client-next">
            <p>Cliente: {order.clientName || 'Cliente varios'}</p>
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
