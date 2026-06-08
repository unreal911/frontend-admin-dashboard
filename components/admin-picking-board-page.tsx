'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { useAdminUi } from '@/components/admin-ui-provider';
import {
  AdminOrder,
  AdminOrderItem,
  AdminOrderStatus,
  AdminPickingUnpickRequest,
  normalizeOrderPickingResponse,
  normalizeOrdersListResponse,
} from '@/lib/admin-order-types';

type PickingResponsibilityMode = 'SHARED' | 'TRANSFER';
type PickingResponsibilityRequestAction = 'APPROVE' | 'REJECT';
type PickingUnpickAction = 'APPROVE' | 'REJECT';

const STATUS_SHORTCUTS: Array<{ value: '' | AdminOrderStatus; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'CONFIRMED', label: 'Confirmados' },
  { value: 'WAITING_TRANSFER', label: 'Transferencia' },
  { value: 'PREPARING', label: 'Preparando' },
  { value: 'READY', label: 'Listos' },
];

function toPickingStatusFilter(value: string | null): '' | AdminOrderStatus {
  const normalized = String(value || '').trim().toUpperCase() as AdminOrderStatus;
  return STATUS_SHORTCUTS.some((shortcut) => shortcut.value === normalized) ? normalized : '';
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

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    CONFIRMED: '#3498db',
    WAITING_TRANSFER: '#9b59b6',
    PREPARING: '#e67e22',
    READY: '#27ae60',
    DELIVERED: '#16a085',
    RETURN_PENDING: '#d35400',
    CANCELLED: '#e74c3c',
    PENDING: '#f39c12',
    WAITING_STOCK: '#c0392b',
  };
  return colors[String(status || '').toUpperCase()] || '#95a5a6';
}

function computeProgress(order: AdminOrder): number {
  if (order.pickingSummary && Number.isFinite(order.pickingSummary.progress)) {
    return Math.max(0, Math.min(100, Number(order.pickingSummary.progress || 0)));
  }
  const totalRequested = order.items.reduce((sum, item) => sum + Math.max(0, Number(item.requestedQuantity ?? item.quantity ?? 0)), 0);
  if (totalRequested <= 0) {
    return 0;
  }
  const totalPicked = order.items.reduce((sum, item) => sum + Math.max(0, Number(item.pickedQuantity ?? item.picked ?? 0)), 0);
  return Math.max(0, Math.min(100, Math.round((totalPicked / totalRequested) * 100)));
}

function getRequestedQuantity(item: AdminOrderItem): number {
  return Math.max(0, Number(item.requestedQuantity ?? item.quantity ?? 0));
}

function getPickedQuantity(item: AdminOrderItem): number {
  return Math.max(0, Number(item.pickedQuantity ?? item.picked ?? 0));
}

function getItemStatus(item: AdminOrderItem): 'PENDING' | 'PARTIAL' | 'COMPLETED' {
  const normalizedStatus = String(item.status || item.pickingStatus || '').toUpperCase();
  if (normalizedStatus === 'COMPLETED' || normalizedStatus === 'PICKED') return 'COMPLETED';
  if (normalizedStatus === 'PARTIAL') return 'PARTIAL';

  const picked = getPickedQuantity(item);
  const requested = getRequestedQuantity(item);
  if (picked <= 0) return 'PENDING';
  if (picked >= requested) return 'COMPLETED';
  return 'PARTIAL';
}

function getItemStatusLabel(status: 'PENDING' | 'PARTIAL' | 'COMPLETED'): string {
  if (status === 'PENDING') return 'Pendiente';
  if (status === 'PARTIAL') return 'Parcial';
  return 'Completo';
}

function getItemPickLimit(item: AdminOrderItem): number {
  const requested = getRequestedQuantity(item);
  const explicitMax = Number(item.maxPickableQuantity);
  if (Number.isFinite(explicitMax) && explicitMax >= 0) {
    return Math.min(requested, explicitMax);
  }

  const reservedQuantity = Number(item.reservedQuantity ?? item.reserved ?? 0);
  if (Number.isFinite(reservedQuantity) && reservedQuantity >= 0) {
    return Math.min(requested, reservedQuantity);
  }

  return requested;
}

function formatDateTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function getItemKey(item: AdminOrderItem): string {
  const orderItemId = Number(item.orderItemId ?? item.id ?? 0);
  if (Number.isInteger(orderItemId) && orderItemId > 0) {
    return `order-item:${orderItemId}`;
  }
  const pickingItemId = Number(item.pickingItemId || 0);
  if (Number.isInteger(pickingItemId) && pickingItemId > 0) {
    return `picking-item:${pickingItemId}`;
  }
  const variantId = Number(item.variantId || 0);
  if (Number.isInteger(variantId) && variantId > 0) {
    return `variant:${variantId}`;
  }
  return '';
}

export function AdminPickingBoardPage() {
  const searchParams = useSearchParams();
  const { showAlert } = useAdminUi();
  const { hasPermission, user } = useAdminAuth();

  const [statusFilter, setStatusFilter] = useState<'' | AdminOrderStatus>('');
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [startingPicking, setStartingPicking] = useState(false);
  const [completingPicking, setCompletingPicking] = useState(false);
  const [updatingItemKeys, setUpdatingItemKeys] = useState<string[]>([]);
  const [isMobileView, setIsMobileView] = useState(false);
  const [pickingResponsibilityFlowEnabledSetting, setPickingResponsibilityFlowEnabledSetting] = useState<boolean | null>(null);

  const [requestingResponsibilityMode, setRequestingResponsibilityMode] = useState<PickingResponsibilityMode | null>(null);
  const [resolvingRequestIds, setResolvingRequestIds] = useState<number[]>([]);
  const [requestingUnpickItemIds, setRequestingUnpickItemIds] = useState<number[]>([]);
  const [resolvingUnpickRequestIds, setResolvingUnpickRequestIds] = useState<number[]>([]);
  const [openUnpickRequestItemId, setOpenUnpickRequestItemId] = useState<number | null>(null);
  const [unpickDraftByItemId, setUnpickDraftByItemId] = useState<Record<number, { quantity: number; note: string }>>({});

  const canStartPickingPermission = hasPermission('picking.start');
  const canUpdatePickingPermission = hasPermission('picking.update');
  const canCompletePickingPermission = hasPermission('picking.complete');
  const currentUserId = Number(user?.id || 0);

  const activeOrders = useMemo(() => {
    return orders.filter((order) => {
      const normalizedStatus = String(order.status || '').toUpperCase();
      return normalizedStatus !== 'DELIVERED' && normalizedStatus !== 'CANCELLED';
    });
  }, [orders]);

  const selectedProgress = useMemo(() => {
    if (!selectedOrder) return 0;
    return computeProgress(selectedOrder);
  }, [selectedOrder]);

  const isPickingResponsibilityFlowEnabled = useMemo(() => {
    if (pickingResponsibilityFlowEnabledSetting !== null) {
      return pickingResponsibilityFlowEnabledSetting;
    }
    return selectedOrder?.pickingResponsibility?.enabled === true;
  }, [pickingResponsibilityFlowEnabledSetting, selectedOrder?.pickingResponsibility?.enabled]);

  const primaryResponsible = selectedOrder?.pickingResponsibility?.primaryResponsible || null;
  const sharedResponsibles = selectedOrder?.pickingResponsibility?.sharedResponsibles || [];
  const pendingResponsibilityRequests = selectedOrder?.pickingResponsibility?.pendingRequests || [];

  const isCurrentUserPrimaryResponsible = useMemo(() => {
    const primaryId = Number(primaryResponsible?.id || 0);
    return Number.isInteger(currentUserId) && currentUserId > 0 && currentUserId === primaryId;
  }, [currentUserId, primaryResponsible?.id]);

  const isCurrentUserSharedResponsible = useMemo(() => {
    if (!Number.isInteger(currentUserId) || currentUserId < 1) {
      return false;
    }
    return sharedResponsibles.some((entry) => Number(entry.user?.id || 0) === currentUserId);
  }, [currentUserId, sharedResponsibles]);

  const canCurrentUserOperatePicking = useMemo(() => {
    if (!isPickingResponsibilityFlowEnabled) {
      return true;
    }
    if (!Number.isInteger(currentUserId) || currentUserId < 1) {
      return false;
    }
    if (!primaryResponsible) {
      return true;
    }
    return isCurrentUserPrimaryResponsible || isCurrentUserSharedResponsible;
  }, [
    currentUserId,
    isCurrentUserPrimaryResponsible,
    isCurrentUserSharedResponsible,
    isPickingResponsibilityFlowEnabled,
    primaryResponsible,
  ]);

  const canStartPicking = useMemo(() => {
    if (!canStartPickingPermission) return false;
    if (!selectedOrder || startingPicking) return false;
    const status = String(selectedOrder.status || '').toUpperCase();
    const hasSession = Boolean(selectedOrder.pickingSession?.id);
    if (hasSession) return false;
    if (isPickingResponsibilityFlowEnabled && !canCurrentUserOperatePicking && primaryResponsible) {
      return false;
    }
    return status === 'CONFIRMED' || status === 'WAITING_TRANSFER' || status === 'PREPARING';
  }, [
    canCurrentUserOperatePicking,
    canStartPickingPermission,
    isPickingResponsibilityFlowEnabled,
    primaryResponsible,
    selectedOrder,
    startingPicking,
  ]);

  const canCompletePicking = useMemo(() => {
    if (!canCompletePickingPermission) return false;
    if (!selectedOrder || completingPicking) return false;
    if (!selectedOrder.pickingSession?.id) return false;
    const status = String(selectedOrder.status || '').toUpperCase();
    if (status === 'READY' || status === 'DELIVERED') return false;
    if (!canCurrentUserOperatePicking) return false;

    const summaryCompleted = selectedOrder.pickingSummary?.completed === true;
    if (summaryCompleted) {
      return true;
    }

    return selectedOrder.items.every((item) => {
      const requested = getRequestedQuantity(item);
      const picked = getPickedQuantity(item);
      return requested > 0 && picked >= getItemPickLimit(item);
    });
  }, [canCompletePickingPermission, canCurrentUserOperatePicking, completingPicking, selectedOrder]);

  const loadOrders = useCallback(async (status: '' | AdminOrderStatus) => {
    setLoadingOrders(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '80',
      });
      if (status) {
        params.set('status', status);
      }

      const response = await fetch(`/api/admin/orders?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudieron cargar pedidos para picking.'), 'error');
        setOrders([]);
        return;
      }

      const normalized = normalizeOrdersListResponse(payload);
      setOrders(normalized.data);
    } catch {
      showAlert('No se pudieron cargar pedidos para picking.', 'error');
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, [showAlert]);

  const loadOrderDetail = useCallback(async (orderId: number) => {
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/picking`, {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo cargar detalle de picking.'), 'error');
        setSelectedOrder((current) => (current?.id === orderId ? null : current));
        return;
      }

      setSelectedOrder((current) => normalizeOrderPickingResponse(payload, current));
    } catch {
      showAlert('No se pudo cargar detalle de picking.', 'error');
      setSelectedOrder((current) => (current?.id === orderId ? null : current));
    } finally {
      setLoadingDetail(false);
    }
  }, [showAlert]);

  const loadOperationalConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/system-config/order-workflow', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return;
      }
      const data = (payload as { data?: { pickingResponsibilityFlowEnabled?: unknown } } | null)?.data;
      if (data && typeof data.pickingResponsibilityFlowEnabled === 'boolean') {
        setPickingResponsibilityFlowEnabledSetting(data.pickingResponsibilityFlowEnabled);
      }
    } catch {
      // Ignore config load errors here and fallback to order payload.
    }
  }, []);

  useEffect(() => {
    void loadOrders(statusFilter);
  }, [loadOrders, statusFilter]);

  useEffect(() => {
    const nextStatus = toPickingStatusFilter(searchParams.get('status'));
    setStatusFilter(nextStatus);
    setSelectedOrderId(null);
    setSelectedOrder(null);
    setRequestingResponsibilityMode(null);
    setResolvingRequestIds([]);
    setRequestingUnpickItemIds([]);
    setResolvingUnpickRequestIds([]);
    setOpenUnpickRequestItemId(null);
    setUnpickDraftByItemId({});
  }, [searchParams]);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrder(null);
      return;
    }
    void loadOrderDetail(selectedOrderId);
  }, [loadOrderDetail, selectedOrderId]);

  useEffect(() => {
    if (!selectedOrderId) {
      return;
    }
    const refreshed = orders.find((order) => order.id === selectedOrderId);
    if (!refreshed) {
      return;
    }
    setSelectedOrder((current) => {
      if (!current || current.id !== refreshed.id) {
        return refreshed;
      }
      return {
        ...current,
        ...refreshed,
        items: current.items.length > 0 ? current.items : refreshed.items,
        pickingSummary: current.pickingSummary || refreshed.pickingSummary || null,
        pickingSession: current.pickingSession || refreshed.pickingSession || null,
        pickingResponsibility: current.pickingResponsibility || refreshed.pickingResponsibility || null,
        clientName: current.clientName || refreshed.clientName,
        clientEmail: current.clientEmail || refreshed.clientEmail,
        clientPhone: current.clientPhone || refreshed.clientPhone,
      };
    });
  }, [orders, selectedOrderId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const media = window.matchMedia('(max-width: 960px)');
    const update = () => setIsMobileView(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    void loadOperationalConfig();
  }, [loadOperationalConfig]);

  function clearSelection() {
    setSelectedOrderId(null);
    setSelectedOrder(null);
    setRequestingResponsibilityMode(null);
    setResolvingRequestIds([]);
    setRequestingUnpickItemIds([]);
    setResolvingUnpickRequestIds([]);
    setOpenUnpickRequestItemId(null);
    setUnpickDraftByItemId({});
  }

  function selectOrder(order: AdminOrder) {
    setSelectedOrderId(order.id);
    setSelectedOrder(order);
    setRequestingResponsibilityMode(null);
    setResolvingRequestIds([]);
    setRequestingUnpickItemIds([]);
    setResolvingUnpickRequestIds([]);
    setOpenUnpickRequestItemId(null);
    setUnpickDraftByItemId({});
  }

  function getPrimaryResponsibleLabel(): string {
    if (!primaryResponsible) {
      return selectedOrder?.pickingSession?.assignedUser?.firstName
        || selectedOrder?.pickerUser?.firstName
        || 'No asignado';
    }
    const name = `${String(primaryResponsible.firstName || '').trim()} ${String(primaryResponsible.lastName || '').trim()}`.trim();
    return name || primaryResponsible.email || `Usuario #${primaryResponsible.id}`;
  }

  function isUpdatingItem(item: AdminOrderItem): boolean {
    const key = getItemKey(item);
    return key.length > 0 && updatingItemKeys.includes(key);
  }

  function getItemContributions(item: AdminOrderItem) {
    return Array.isArray(item.contributions) ? item.contributions : [];
  }

  function getPendingUnpickRequests(item: AdminOrderItem): AdminPickingUnpickRequest[] {
    return Array.isArray(item.pendingUnpickRequests) ? item.pendingUnpickRequests : [];
  }

  function getCurrentUserContribution(item: AdminOrderItem): number {
    if (!Number.isInteger(currentUserId) || currentUserId < 1) {
      return 0;
    }
    const own = getItemContributions(item).find((entry) => Number(entry.user?.id || 0) === currentUserId);
    return Math.max(0, Number(own?.quantity || 0));
  }

  function getUnpickRequestableQuantity(item: AdminOrderItem): number {
    const picked = getPickedQuantity(item);
    return Math.max(0, picked - getCurrentUserContribution(item));
  }

  function canCurrentUserUnpickDirectly(item: AdminOrderItem): boolean {
    if (!isPickingResponsibilityFlowEnabled) {
      return true;
    }
    const contributions = getItemContributions(item);
    if (contributions.length === 0) {
      return true;
    }
    return getCurrentUserContribution(item) > 0;
  }

  function canShowUnpickRequestButton(item: AdminOrderItem): boolean {
    if (!isPickingResponsibilityFlowEnabled || !canCurrentUserOperatePicking) {
      return false;
    }
    if (getPickedQuantity(item) <= 0) {
      return false;
    }
    return getUnpickRequestableQuantity(item) > 0;
  }

  function getPickingItemId(item: AdminOrderItem): number {
    const pickingItemId = Number(item.pickingItemId || 0);
    return Number.isInteger(pickingItemId) && pickingItemId > 0 ? pickingItemId : 0;
  }

  function isUnpickRequestFormOpen(item: AdminOrderItem): boolean {
    const pickingItemId = getPickingItemId(item);
    return pickingItemId > 0 && openUnpickRequestItemId === pickingItemId;
  }

  function isRequestingUnpickForItem(item: AdminOrderItem): boolean {
    const pickingItemId = getPickingItemId(item);
    return pickingItemId > 0 && requestingUnpickItemIds.includes(pickingItemId);
  }

  function getUnpickDraft(item: AdminOrderItem): { quantity: number; note: string } {
    const pickingItemId = getPickingItemId(item);
    if (pickingItemId < 1) {
      return { quantity: 1, note: '' };
    }
    return unpickDraftByItemId[pickingItemId] || { quantity: 1, note: '' };
  }

  function openUnpickRequestForm(item: AdminOrderItem) {
    const pickingItemId = getPickingItemId(item);
    if (pickingItemId < 1 || !canShowUnpickRequestButton(item)) {
      return;
    }
    const maxQuantity = Math.max(1, getUnpickRequestableQuantity(item));
    const existing = unpickDraftByItemId[pickingItemId];
    setUnpickDraftByItemId((current) => ({
      ...current,
      [pickingItemId]: {
        quantity: Math.max(1, Math.min(Number(existing?.quantity || 1), maxQuantity)),
        note: String(existing?.note || ''),
      },
    }));
    setOpenUnpickRequestItemId(pickingItemId);
  }

  function closeUnpickRequestForm(item?: AdminOrderItem) {
    if (!item) {
      setOpenUnpickRequestItemId(null);
      return;
    }
    const pickingItemId = getPickingItemId(item);
    if (pickingItemId > 0 && openUnpickRequestItemId === pickingItemId) {
      setOpenUnpickRequestItemId(null);
    }
  }

  function toggleUnpickRequestForm(item: AdminOrderItem) {
    if (isUnpickRequestFormOpen(item)) {
      closeUnpickRequestForm(item);
      return;
    }
    openUnpickRequestForm(item);
  }

  function updateUnpickRequestDraftQuantity(item: AdminOrderItem, rawQuantity: number | string) {
    const pickingItemId = getPickingItemId(item);
    if (pickingItemId < 1) {
      return;
    }
    const parsedRaw = Number(rawQuantity);
    const maxQuantity = Math.max(1, getUnpickRequestableQuantity(item));
    const normalizedQuantity = Math.max(1, Math.min(maxQuantity, Number.isFinite(parsedRaw) ? Math.floor(parsedRaw) : 1));
    setUnpickDraftByItemId((current) => ({
      ...current,
      [pickingItemId]: {
        quantity: normalizedQuantity,
        note: String(current[pickingItemId]?.note || ''),
      },
    }));
  }

  function updateUnpickRequestDraftNote(item: AdminOrderItem, note: string) {
    const pickingItemId = getPickingItemId(item);
    if (pickingItemId < 1) {
      return;
    }
    setUnpickDraftByItemId((current) => ({
      ...current,
      [pickingItemId]: {
        quantity: Math.max(1, Number(current[pickingItemId]?.quantity || 1)),
        note: String(note || ''),
      },
    }));
  }

  function canSubmitUnpickRequest(item: AdminOrderItem): boolean {
    if (!selectedOrder || !canShowUnpickRequestButton(item) || isRequestingUnpickForItem(item)) {
      return false;
    }
    const draft = getUnpickDraft(item);
    const quantity = Number(draft.quantity || 0);
    const maxQuantity = getUnpickRequestableQuantity(item);
    return Number.isInteger(quantity) && quantity > 0 && quantity <= maxQuantity;
  }

  function isResolvingUnpickRequest(requestId: number): boolean {
    return resolvingUnpickRequestIds.includes(requestId);
  }

  function canResolveUnpickRequest(item: AdminOrderItem, request: AdminPickingUnpickRequest): boolean {
    if (!isPickingResponsibilityFlowEnabled) return false;
    if (!Number.isInteger(currentUserId) || currentUserId < 1) return false;
    const requesterId = Number(request.requester?.id || 0);
    if (requesterId === currentUserId) return false;
    if (isCurrentUserPrimaryResponsible) return true;
    const ownContribution = getCurrentUserContribution(item);
    const requestedQuantity = Math.max(0, Number(request.quantity || 0));
    return requestedQuantity > 0 && ownContribution >= requestedQuantity;
  }

  function hasPendingRequestByCurrentUser(mode?: PickingResponsibilityMode): boolean {
    if (!Number.isInteger(currentUserId) || currentUserId < 1) {
      return false;
    }
    return pendingResponsibilityRequests.some((request) => {
      const requesterId = Number(request.requester?.id || 0);
      const requestMode = String(request.mode || '').toUpperCase();
      if (requesterId !== currentUserId) {
        return false;
      }
      if (!mode) {
        return true;
      }
      return requestMode === mode;
    });
  }

  function canRequestResponsibility(mode: PickingResponsibilityMode): boolean {
    if (!selectedOrder || requestingResponsibilityMode !== null) return false;
    if (!isPickingResponsibilityFlowEnabled) return false;
    if (isCurrentUserPrimaryResponsible || isCurrentUserSharedResponsible) return false;
    if (hasPendingRequestByCurrentUser(mode)) return false;
    return true;
  }

  function canResolveResponsibilityRequests(): boolean {
    return isPickingResponsibilityFlowEnabled && isCurrentUserPrimaryResponsible;
  }

  function isResolvingResponsibilityRequest(requestId: number): boolean {
    return resolvingRequestIds.includes(requestId);
  }

  async function refreshAfterAction(orderId: number) {
    await loadOrders(statusFilter);
    await loadOrderDetail(orderId);
  }

  async function startPicking() {
    if (!canStartPickingPermission) {
      showAlert('No tienes permiso para iniciar picking.', 'error');
      return;
    }
    if (!selectedOrder || startingPicking) return;
    if (!canCurrentUserOperatePicking) {
      showAlert('No tienes responsabilidad asignada para iniciar este picking.', 'warning');
      return;
    }

    setStartingPicking(true);
    try {
      const response = await fetch(`/api/admin/orders/${selectedOrder.id}/picking/start`, {
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
      await refreshAfterAction(selectedOrder.id);
    } catch {
      showAlert('No se pudo iniciar picking.', 'error');
    } finally {
      setStartingPicking(false);
    }
  }

  async function completePicking() {
    if (!canCompletePickingPermission) {
      showAlert('No tienes permiso para finalizar picking.', 'error');
      return;
    }
    if (!selectedOrder || completingPicking) return;
    if (!canCurrentUserOperatePicking) {
      showAlert('No tienes responsabilidad asignada para finalizar este picking.', 'warning');
      return;
    }

    setCompletingPicking(true);
    try {
      const response = await fetch(`/api/admin/orders/${selectedOrder.id}/picking/complete`, {
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
      showAlert('Picking finalizado. El pedido quedo en READY.', 'success');
      await refreshAfterAction(selectedOrder.id);
    } catch {
      showAlert('No se pudo finalizar picking.', 'error');
    } finally {
      setCompletingPicking(false);
    }
  }

  async function updateItemPickedQuantity(item: AdminOrderItem, nextPickedQuantity: number) {
    if (!canUpdatePickingPermission) {
      showAlert('No tienes permiso para actualizar items de picking.', 'error');
      return;
    }
    if (!selectedOrder) return;
    if (!canCurrentUserOperatePicking) {
      showAlert('No tienes responsabilidad asignada para actualizar este picking.', 'warning');
      return;
    }

    const updateKey = getItemKey(item);
    if (!updateKey || updatingItemKeys.includes(updateKey)) {
      return;
    }

    const orderItemId = Number(item.orderItemId ?? item.id ?? 0);
    const pickingItemId = Number(item.pickingItemId || 0);
    let endpoint = '';
    if (Number.isInteger(orderItemId) && orderItemId > 0) {
      endpoint = `/api/admin/orders/${selectedOrder.id}/picking/order-items/${orderItemId}`;
    } else if (Number.isInteger(pickingItemId) && pickingItemId > 0) {
      endpoint = `/api/admin/orders/picking/items/${pickingItemId}`;
    }

    if (!endpoint) {
      showAlert('No se pudo identificar el item de picking.', 'error');
      return;
    }

    setUpdatingItemKeys((current) => [...current, updateKey]);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pickedQuantity: nextPickedQuantity }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo actualizar item de picking.'), 'error');
        return;
      }
      await refreshAfterAction(selectedOrder.id);
    } catch {
      showAlert('No se pudo actualizar item de picking.', 'error');
    } finally {
      setUpdatingItemKeys((current) => current.filter((key) => key !== updateKey));
    }
  }

  async function requestResponsibility(mode: PickingResponsibilityMode) {
    if (!selectedOrder || !canRequestResponsibility(mode)) {
      return;
    }

    setRequestingResponsibilityMode(mode);
    try {
      const response = await fetch(`/api/admin/orders/${selectedOrder.id}/picking/responsibility/request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo enviar la solicitud.'), 'error');
        return;
      }
      showAlert(mode === 'TRANSFER'
        ? 'Solicitud para tomar responsabilidad enviada.'
        : 'Solicitud para responsabilidad compartida enviada.', 'success');
      await refreshAfterAction(selectedOrder.id);
    } catch {
      showAlert('No se pudo enviar la solicitud.', 'error');
    } finally {
      setRequestingResponsibilityMode(null);
    }
  }

  async function resolveResponsibilityRequest(requestId: number, action: PickingResponsibilityRequestAction) {
    if (!selectedOrder || !canResolveResponsibilityRequests()) {
      return;
    }
    if (!Number.isInteger(requestId) || requestId < 1 || resolvingRequestIds.includes(requestId)) {
      return;
    }

    setResolvingRequestIds((current) => [...current, requestId]);
    try {
      const response = await fetch(`/api/admin/orders/${selectedOrder.id}/picking/responsibility/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo resolver la solicitud.'), 'error');
        return;
      }
      showAlert(action === 'APPROVE' ? 'Solicitud aprobada.' : 'Solicitud rechazada.', action === 'APPROVE' ? 'success' : 'info');
      await refreshAfterAction(selectedOrder.id);
    } catch {
      showAlert('No se pudo resolver la solicitud.', 'error');
    } finally {
      setResolvingRequestIds((current) => current.filter((id) => id !== requestId));
    }
  }

  async function submitUnpickRequest(item: AdminOrderItem) {
    if (!selectedOrder || !canSubmitUnpickRequest(item)) {
      return;
    }
    const pickingItemId = getPickingItemId(item);
    if (pickingItemId < 1) {
      return;
    }
    const draft = getUnpickDraft(item);

    setRequestingUnpickItemIds((current) => [...current, pickingItemId]);
    try {
      const response = await fetch(`/api/admin/orders/${selectedOrder.id}/picking/items/${pickingItemId}/unpick-request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quantity: Number(draft.quantity || 0),
          note: String(draft.note || '').trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo enviar la solicitud.'), 'error');
        return;
      }
      showAlert('Solicitud de accion enviada.', 'success');
      setOpenUnpickRequestItemId(null);
      setUnpickDraftByItemId((current) => {
        const next = { ...current };
        delete next[pickingItemId];
        return next;
      });
      await refreshAfterAction(selectedOrder.id);
    } catch {
      showAlert('No se pudo enviar la solicitud.', 'error');
    } finally {
      setRequestingUnpickItemIds((current) => current.filter((id) => id !== pickingItemId));
    }
  }

  async function resolveUnpickRequest(item: AdminOrderItem, requestId: number, action: PickingUnpickAction) {
    const request = getPendingUnpickRequests(item).find((entry) => Number(entry.id) === Number(requestId));
    if (!selectedOrder || !request || !canResolveUnpickRequest(item, request)) {
      return;
    }
    if (!Number.isInteger(requestId) || requestId < 1 || resolvingUnpickRequestIds.includes(requestId)) {
      return;
    }

    setResolvingUnpickRequestIds((current) => [...current, requestId]);
    try {
      const response = await fetch(`/api/admin/orders/${selectedOrder.id}/picking/unpick-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo resolver la solicitud.'), 'error');
        return;
      }
      showAlert(action === 'APPROVE' ? 'Solicitud de unpick aprobada.' : 'Solicitud de unpick rechazada.', action === 'APPROVE' ? 'success' : 'info');
      await refreshAfterAction(selectedOrder.id);
    } catch {
      showAlert('No se pudo resolver la solicitud.', 'error');
    } finally {
      setResolvingUnpickRequestIds((current) => current.filter((id) => id !== requestId));
    }
  }

  function markItemPicked(item: AdminOrderItem) {
    const requested = getItemPickLimit(item);
    const picked = getPickedQuantity(item);
    void updateItemPickedQuantity(item, Math.min(requested, picked + 1));
  }

  function markItemComplete(item: AdminOrderItem) {
    const requested = getItemPickLimit(item);
    void updateItemPickedQuantity(item, requested);
  }

  function markItemUnpicked(item: AdminOrderItem) {
    if (isPickingResponsibilityFlowEnabled && !canCurrentUserUnpickDirectly(item)) {
      openUnpickRequestForm(item);
      showAlert('No puedes restar unidades separadas por otro colaborador. Usa "Solicitar accion".', 'info');
      return;
    }
    const picked = getPickedQuantity(item);
    void updateItemPickedQuantity(item, Math.max(0, picked - 1));
  }

  function renderPickingDetail() {
    if (!selectedOrderId) {
      return <p className="admin-muted-text">Selecciona un pedido para ver y operar el picking.</p>;
    }
    if (loadingDetail && !selectedOrder) {
      return <p className="admin-muted-text">Cargando detalle de picking...</p>;
    }
    if (!selectedOrder) {
      return <p className="admin-muted-text">No se pudo cargar el detalle del picking.</p>;
    }

    return (
      <>
        <div className="picking-detail-head-next">
          <div>
            <h2>{selectedOrder.code}</h2>
            <p>
              {selectedOrder.clientName || selectedOrder.clientEmail || 'Cliente'}
              {' - '}
              {getStatusLabel(selectedOrder.status)}
            </p>
          </div>
          <button type="button" className="admin-ghost-btn" onClick={clearSelection}>Cerrar</button>
        </div>

        <div className="picking-progress-main-next">
          <div className="picking-progress-track-next">
            <div className="picking-progress-fill-next" style={{ width: `${selectedProgress}%` }} />
          </div>
          <strong>{selectedProgress}% completado</strong>
        </div>

        <div className="picking-responsibility-box-next">
          <p><strong>Responsable picking:</strong> {getPrimaryResponsibleLabel()}</p>
          {isPickingResponsibilityFlowEnabled ? (
            <>
              <p className="admin-muted-text">Flujo de responsabilidad en picking activo.</p>
              {sharedResponsibles.length > 0 ? (
                <div className="picking-inline-chips-next">
                  {sharedResponsibles.map((entry) => (
                    <span key={`shared-${entry.id}-${entry.user?.id || 'na'}`} className="picking-chip-next">
                      {(entry.user?.firstName || '').trim()} {(entry.user?.lastName || '').trim()}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="admin-muted-text">Responsables compartidos: ninguno.</p>
              )}
            </>
          ) : (
            <p className="admin-muted-text">Configuracion operativa: flujo de responsabilidad en picking desactivado.</p>
          )}
        </div>

        {isPickingResponsibilityFlowEnabled && !isCurrentUserPrimaryResponsible && !isCurrentUserSharedResponsible ? (
          <div className="picking-action-stack-next">
            <p className="admin-muted-text">Puedes solicitar participar en este picking.</p>
            <div className="admin-table-actions">
              <button
                type="button"
                className="admin-primary-btn"
                disabled={!canRequestResponsibility('SHARED')}
                onClick={() => void requestResponsibility('SHARED')}
              >
                {requestingResponsibilityMode === 'SHARED' ? 'Enviando...' : 'Solicitar responsabilidad compartida'}
              </button>
              <button
                type="button"
                className="admin-ghost-btn"
                disabled={!canRequestResponsibility('TRANSFER')}
                onClick={() => void requestResponsibility('TRANSFER')}
              >
                {requestingResponsibilityMode === 'TRANSFER' ? 'Enviando...' : 'Solicitar ser responsable principal'}
              </button>
            </div>
          </div>
        ) : null}

        {pendingResponsibilityRequests.length > 0 ? (
          <div className="admin-table-wrap">
            <table className="admin-table mobile-card-table picking-requests-table-next">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Modo solicitado</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pendingResponsibilityRequests.map((request) => (
                  <tr key={`responsibility-request-${request.id}`}>
                    <td data-label="Usuario">
                      {(request.requester?.firstName || '').trim()} {(request.requester?.lastName || '').trim()}
                    </td>
                    <td data-label="Modo solicitado">
                      {String(request.mode || '').toUpperCase() === 'TRANSFER'
                        ? 'Transferir responsable'
                        : 'Compartir responsable'}
                    </td>
                    <td data-label="Fecha">{formatDateTime(request.createdAt)}</td>
                    <td data-label="Accion">
                      {canResolveResponsibilityRequests() ? (
                        <div className="admin-table-actions">
                          <button
                            type="button"
                            className="admin-primary-btn"
                            disabled={isResolvingResponsibilityRequest(request.id)}
                            onClick={() => void resolveResponsibilityRequest(request.id, 'APPROVE')}
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            className="admin-ghost-btn"
                            disabled={isResolvingResponsibilityRequest(request.id)}
                            onClick={() => void resolveResponsibilityRequest(request.id, 'REJECT')}
                          >
                            Rechazar
                          </button>
                        </div>
                      ) : (
                        <span className="admin-muted-text">Pendiente de decision del responsable principal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {canStartPicking ? (
          <div className="admin-table-actions">
            <button type="button" className="admin-primary-btn" disabled={startingPicking} onClick={() => void startPicking()}>
              {startingPicking ? 'Iniciando...' : 'Iniciar preparacion'}
            </button>
          </div>
        ) : null}

        {!selectedOrder.pickingSession?.id ? (
          <p className="admin-muted-text">Esta orden aun no tiene una sesion de picking iniciada.</p>
        ) : (
          <>
            {loadingDetail ? <p className="admin-muted-text">Actualizando datos de picking...</p> : null}
            <div className="admin-table-wrap">
              <table className="admin-table mobile-card-table">
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
                  {selectedOrder.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} data-label="Estado">No hay items para picking.</td>
                    </tr>
                  ) : (
                    selectedOrder.items.map((item) => {
                      const requested = getRequestedQuantity(item);
                      const picked = getPickedQuantity(item);
                      const missing = Math.max(0, Number(item.missingQuantity ?? Math.max(0, requested - picked)));
                      const status = getItemStatus(item);
                      const rowKey = `${item.orderItemId ?? item.id}-${item.pickingItemId ?? 0}-${item.variantId}`;
                      return (
                        <tr key={rowKey}>
                          <td data-label="Producto">{item.variant.productName}</td>
                          <td data-label="Variante">
                            {item.variant.colorName} / {item.variant.sizeName} - {item.variant.sku}
                            {getItemContributions(item).length > 0 ? (
                              <div className="picking-contrib-list-next">
                                {getItemContributions(item).map((contribution) => (
                                  <span key={`contrib-${rowKey}-${contribution.id}`} className="picking-contrib-chip-next">
                                    {(contribution.user?.firstName || contribution.user?.email || `U#${contribution.user?.id || '-'}`)}: {contribution.quantity}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </td>
                          <td data-label="Solicitada">{requested}</td>
                          <td data-label="Separada">{picked}</td>
                          <td data-label="Faltante">{missing}</td>
                          <td data-label="Estado">{getItemStatusLabel(status)}</td>
                          <td data-label="Accion">
                            <div className="picking-row-actions-next">
                              <button
                                type="button"
                                className="admin-ghost-btn"
                                disabled={!canUpdatePickingPermission || isUpdatingItem(item) || picked <= 0}
                                onClick={() => markItemUnpicked(item)}
                              >
                                -
                              </button>
                              <button
                                type="button"
                                className="admin-ghost-btn"
                                disabled={!canUpdatePickingPermission || isUpdatingItem(item) || picked >= getItemPickLimit(item)}
                                onClick={() => markItemPicked(item)}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                className="admin-ghost-btn"
                                disabled={!canUpdatePickingPermission || isUpdatingItem(item) || picked >= getItemPickLimit(item)}
                                onClick={() => markItemComplete(item)}
                              >
                                Completar
                              </button>
                              {canShowUnpickRequestButton(item) ? (
                                <button
                                  type="button"
                                  className="admin-ghost-btn"
                                  disabled={isRequestingUnpickForItem(item)}
                                  onClick={() => toggleUnpickRequestForm(item)}
                                >
                                  {isUnpickRequestFormOpen(item) ? 'Cancelar solicitud' : 'Solicitar accion'}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  {selectedOrder.items.map((item) => {
                    const pendingUnpick = getPendingUnpickRequests(item);
                    const showForm = isUnpickRequestFormOpen(item);
                    if (!showForm && pendingUnpick.length === 0) {
                      return null;
                    }

                    const rowKey = `unpick-${item.orderItemId ?? item.id}-${item.pickingItemId ?? 0}-${item.variantId}`;
                    const draft = getUnpickDraft(item);
                    return (
                      <tr key={rowKey} className="picking-unpick-row-next">
                        <td colSpan={7}>
                          {showForm ? (
                            <div className="picking-unpick-form-next">
                              <strong>Solicitar unpick de unidades separadas por otro colaborador</strong>
                              <div className="picking-unpick-fields-next">
                                <label>
                                  Cantidad
                                  <input
                                    type="number"
                                    min={1}
                                    max={Math.max(1, getUnpickRequestableQuantity(item))}
                                    value={draft.quantity}
                                    onChange={(event) => updateUnpickRequestDraftQuantity(item, event.target.value)}
                                  />
                                </label>
                                <label>
                                  Nota (opcional)
                                  <input
                                    type="text"
                                    value={draft.note}
                                    maxLength={200}
                                    placeholder="Ej. ajustar cantidad por cambio de cliente"
                                    onChange={(event) => updateUnpickRequestDraftNote(item, event.target.value)}
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="admin-primary-btn"
                                  disabled={!canSubmitUnpickRequest(item)}
                                  onClick={() => void submitUnpickRequest(item)}
                                >
                                  {isRequestingUnpickForItem(item) ? 'Enviando...' : 'Enviar solicitud'}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {pendingUnpick.length > 0 ? (
                            <div className="picking-pending-unpick-next">
                              <strong>Solicitudes pendientes</strong>
                              {pendingUnpick.map((request) => (
                                <div key={`pending-unpick-${request.id}`} className="picking-pending-unpick-entry-next">
                                  <div>
                                    <span>
                                      <strong>{(request.requester?.firstName || '').trim()} {(request.requester?.lastName || '').trim()}</strong>
                                      {' '}pide retirar <strong>{request.quantity}</strong> und.
                                    </span>
                                    {request.note ? <small>({request.note})</small> : null}
                                  </div>
                                  <div className="admin-table-actions">
                                    {canResolveUnpickRequest(item, request) ? (
                                      <>
                                        <button
                                          type="button"
                                          className="admin-primary-btn"
                                          disabled={isResolvingUnpickRequest(request.id)}
                                          onClick={() => void resolveUnpickRequest(item, request.id, 'APPROVE')}
                                        >
                                          Aprobar
                                        </button>
                                        <button
                                          type="button"
                                          className="admin-ghost-btn"
                                          disabled={isResolvingUnpickRequest(request.id)}
                                          onClick={() => void resolveUnpickRequest(item, request.id, 'REJECT')}
                                        >
                                          Rechazar
                                        </button>
                                      </>
                                    ) : (
                                      <span className="admin-muted-text">Pendiente de aprobacion</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {canCompletePicking ? (
              <div className="admin-table-actions">
                <button
                  type="button"
                  className="admin-primary-btn"
                  disabled={completingPicking}
                  onClick={() => void completePicking()}
                >
                  {completingPicking ? 'Finalizando...' : 'Finalizar preparacion'}
                </button>
              </div>
            ) : (
              <p className="admin-muted-text">
                {!canCompletePickingPermission
                  ? 'Sin permiso picking.complete para finalizar la preparacion.'
                  : 'Completa la separacion de todos los productos para dejar el pedido listo.'}
              </p>
            )}
            {!canUpdatePickingPermission ? (
              <p className="admin-muted-text">Sin permiso picking.update: no puedes ajustar cantidades separadas.</p>
            ) : null}
          </>
        )}
      </>
    );
  }

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card">
        <p className="section-kicker">Pedidos</p>
        <h1 className="section-title">Tablero de picking</h1>
        <p className="section-subtitle">Gestion de preparacion y separacion de productos por pedido.</p>
      </article>

      <section className="picking-board-layout-next">
        <article className="admin-card picking-orders-panel-next">
          <div className="picking-toolbar-next">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as '' | AdminOrderStatus)}
            >
              {STATUS_SHORTCUTS.map((status) => (
                <option key={status.value || 'all'} value={status.value}>{status.label}</option>
              ))}
            </select>
            <div className="picking-status-shortcuts-next">
              {STATUS_SHORTCUTS.map((shortcut) => (
                <button
                  key={shortcut.value || 'all'}
                  type="button"
                  className={statusFilter === shortcut.value ? 'active' : ''}
                  onClick={() => setStatusFilter(shortcut.value)}
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          </div>

          {loadingOrders ? (
            <p className="admin-muted-text">Cargando pedidos...</p>
          ) : activeOrders.length === 0 ? (
            <p className="admin-muted-text">No hay pedidos para preparar.</p>
          ) : (
            <div className="picking-orders-list-next">
              {activeOrders.map((order) => {
                const progress = computeProgress(order);
                return (
                  <button
                    key={order.id}
                    type="button"
                    className={`picking-order-card-next ${selectedOrderId === order.id ? 'selected' : ''}`}
                    onClick={() => selectOrder(order)}
                  >
                    <div className="picking-order-card-head-next">
                      <strong>{order.code}</strong>
                      <span style={{ backgroundColor: getStatusColor(order.status) }}>{getStatusLabel(order.status)}</span>
                    </div>
                    <p>{order.clientName || order.clientEmail || 'Cliente'}</p>
                    <p>{order.items.length} productos</p>
                    <div className="picking-progress-track-next">
                      <div className="picking-progress-fill-next" style={{ width: `${progress}%` }} />
                    </div>
                    <small>{progress}% completado</small>
                  </button>
                );
              })}
            </div>
          )}
        </article>

        {!isMobileView ? (
          <article className="admin-card picking-detail-panel-next">
            {renderPickingDetail()}
          </article>
        ) : null}
      </section>

      {isMobileView && selectedOrderId ? (
        <div className="picking-modal-overlay-next" onClick={clearSelection}>
          <article className="admin-card picking-modal-next" onClick={(event) => event.stopPropagation()}>
            {renderPickingDetail()}
          </article>
        </div>
      ) : null}
    </section>
  );
}
