'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminOrder,
  AdminOrderStatus,
  normalizeOrdersListResponse,
} from '@/lib/admin-order-types';
import {
  Inventory,
  InventoryStore,
  StockTransfer,
  normalizeInventoryList,
  normalizeTransfers,
} from '@/lib/admin-inventory-types';

type SalesChannel = 'POS' | 'ECOMMERCE' | 'INTERNAL';
type StockScope = 'OUT' | 'CRITICAL' | 'LOW' | 'NORMAL' | 'CRITICAL_TOTAL';

interface TopSaleMetric {
  label: string;
  quantity: number;
  total: number;
}

interface SalesByChannelMetric {
  channel: SalesChannel;
  total: number;
  orders: number;
}

interface SalesTrendMetric {
  label: string;
  total: number;
  orders: number;
}

interface StockSummaryMetric {
  outOfStock: number;
  critical: number;
  low: number;
  normal: number;
}

interface PendingOrdersMetric {
  pending: number;
  paidWithoutPicking: number;
  pickingInProgress: number;
  readyToDeliver: number;
  overdue: number;
}

interface PendingInboxMetric {
  toConfirm: number;
  waitingStock: number;
  toPick: number;
  waitingTransfer: number;
  transfersToReceive: number;
  preparing: number;
  ready: number;
  returnPending: number;
}

type PendingTaskTone = 'urgent' | 'warn' | 'info';

interface PendingTask {
  key: string;
  label: string;
  description: string;
  count: number;
  href: string;
  tone: PendingTaskTone;
}

interface StoreSalesMetric {
  storeName: string;
  total: number;
  orders: number;
  ticketAverage: number;
}

interface DashboardMetrics {
  salesToday: number;
  ordersToday: number;
  avgTicketToday: number;
  salesYesterday: number;
  salesVsYesterdayPct: number | null;
  weeklySales: number;
  weeklyOrders: number;
  salesByChannel: SalesByChannelMetric[];
  salesTrend: SalesTrendMetric[];
  topProductsToday: TopSaleMetric[];
  topProductsWeek: TopSaleMetric[];
  topVariantsToday: TopSaleMetric[];
  topVariantsWeek: TopSaleMetric[];
  stockSummary: StockSummaryMetric;
  pendingOrders: PendingOrdersMetric;
  pendingInbox: PendingInboxMetric;
  picking: {
    completedToday: number;
    avgPreparationMinutes: number | null;
  };
  salesByStore: StoreSalesMetric[];
}

const SALES_ELIGIBLE_STATUSES = new Set<AdminOrderStatus>([
  'CONFIRMED',
  'WAITING_TRANSFER',
  'PREPARING',
  'READY',
  'DELIVERED',
]);

const PENDING_ORDER_STATUSES = new Set<AdminOrderStatus>([
  'PENDING',
  'CONFIRMED',
  'WAITING_TRANSFER',
  'PREPARING',
  'READY',
]);

const currencyFormatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function createEmptyMetrics(): DashboardMetrics {
  return {
    salesToday: 0,
    ordersToday: 0,
    avgTicketToday: 0,
    salesYesterday: 0,
    salesVsYesterdayPct: null,
    weeklySales: 0,
    weeklyOrders: 0,
    salesByChannel: [
      { channel: 'POS', total: 0, orders: 0 },
      { channel: 'ECOMMERCE', total: 0, orders: 0 },
      { channel: 'INTERNAL', total: 0, orders: 0 },
    ],
    salesTrend: [],
    topProductsToday: [],
    topProductsWeek: [],
    topVariantsToday: [],
    topVariantsWeek: [],
    stockSummary: {
      outOfStock: 0,
      critical: 0,
      low: 0,
      normal: 0,
    },
    pendingOrders: {
      pending: 0,
      paidWithoutPicking: 0,
      pickingInProgress: 0,
      readyToDeliver: 0,
      overdue: 0,
    },
    pendingInbox: {
      toConfirm: 0,
      waitingStock: 0,
      toPick: 0,
      waitingTransfer: 0,
      transfersToReceive: 0,
      preparing: 0,
      ready: 0,
      returnPending: 0,
    },
    picking: {
      completedToday: 0,
      avgPreparationMinutes: null,
    },
    salesByStore: [],
  };
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatShortDateTime(value: Date | null): string {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(value);
}

function toNumber(value: unknown): number {
  const numeric = Number(typeof value === 'string' ? value.replace(',', '.') : value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getSafeDate(value?: string): Date {
  const date = value ? new Date(value) : new Date(0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function getDayRange(offsetDays: number): { start: Date; end: Date } {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + offsetDays);

  const start = new Date(base);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getCurrentWeekRange(): { start: Date; end: Date } {
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - mondayOffset);
  start.setHours(0, 0, 0, 0);

  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getDaysAgoStart(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getLastDaysRanges(days: number): Array<{ start: Date; end: Date; label: string }> {
  const ranges: Array<{ start: Date; end: Date; label: string }> = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const range = getDayRange(-index);
    ranges.push({
      ...range,
      label: `${String(range.start.getDate()).padStart(2, '0')}/${String(range.start.getMonth() + 1).padStart(2, '0')}`,
    });
  }
  return ranges;
}

function filterOrdersByRange(orders: AdminOrder[], start: Date, end: Date): AdminOrder[] {
  return orders.filter((order) => {
    const createdAt = getSafeDate(order.createdAt);
    return createdAt >= start && createdAt <= end;
  });
}

function filterSalesOrders(orders: AdminOrder[]): AdminOrder[] {
  return orders.filter((order) => SALES_ELIGIBLE_STATUSES.has(order.status));
}

function sumOrderTotals(orders: AdminOrder[]): number {
  return orders.reduce((total, order) => total + toNumber(order.total), 0);
}

function computePercentageChange(previous: number, current: number): number | null {
  if (previous <= 0) {
    return current > 0 ? 100 : null;
  }
  return ((current - previous) / previous) * 100;
}

function normalizeChannel(channel: string): SalesChannel {
  const normalized = String(channel || '').trim().toUpperCase();
  if (normalized === 'POS' || normalized === 'ECOMMERCE' || normalized === 'INTERNAL') {
    return normalized;
  }
  return 'INTERNAL';
}

function aggregateTopSales(orders: AdminOrder[], mode: 'product' | 'variant'): TopSaleMetric[] {
  const accumulator = new Map<string, TopSaleMetric>();

  for (const order of orders) {
    for (const item of order.items || []) {
      const quantity = toNumber(item.quantity);
      if (quantity <= 0) {
        continue;
      }

      const subtotal = toNumber(item.subtotal) || quantity * toNumber(item.unitPrice);
      const productName = item.variant?.productName || 'Producto';
      const variantLabel = `${productName} - ${item.variant?.colorName || 'Sin color'} / ${item.variant?.sizeName || 'Sin talla'}`;
      const key = mode === 'product'
        ? `product-${productName}`
        : `variant-${item.variantId || item.variant?.sku || variantLabel}`;
      const label = mode === 'product' ? productName : variantLabel;
      const existing = accumulator.get(key);

      if (existing) {
        existing.quantity += quantity;
        existing.total += subtotal;
      } else {
        accumulator.set(key, { label, quantity, total: subtotal });
      }
    }
  }

  return Array.from(accumulator.values())
    .sort((a, b) => (b.quantity !== a.quantity ? b.quantity - a.quantity : b.total - a.total))
    .slice(0, 5);
}

function buildSalesByChannel(orders: AdminOrder[]): SalesByChannelMetric[] {
  const base: Record<SalesChannel, SalesByChannelMetric> = {
    POS: { channel: 'POS', total: 0, orders: 0 },
    ECOMMERCE: { channel: 'ECOMMERCE', total: 0, orders: 0 },
    INTERNAL: { channel: 'INTERNAL', total: 0, orders: 0 },
  };

  for (const order of orders) {
    const channel = normalizeChannel(order.salesChannel);
    base[channel].orders += 1;
    base[channel].total += toNumber(order.total);
  }

  return [base.POS, base.ECOMMERCE, base.INTERNAL];
}

function buildSalesTrend(orders: AdminOrder[]): SalesTrendMetric[] {
  return getLastDaysRanges(7).map((range) => {
    const dayOrders = filterSalesOrders(filterOrdersByRange(orders, range.start, range.end));
    return {
      label: range.label,
      total: sumOrderTotals(dayOrders),
      orders: dayOrders.length,
    };
  });
}

function getAvailableStock(item: Inventory): number {
  const available = Number(item.availableStock);
  if (Number.isFinite(available)) {
    return available;
  }
  return Number(item.stock || 0) - Number(item.reservedStock || 0);
}

function buildStockSummary(inventories: Inventory[]): StockSummaryMetric {
  return inventories.reduce<StockSummaryMetric>((summary, item) => {
    const available = getAvailableStock(item);
    if (available <= 0) {
      summary.outOfStock += 1;
    } else if (available <= 3) {
      summary.critical += 1;
    } else if (available <= 10) {
      summary.low += 1;
    } else {
      summary.normal += 1;
    }
    return summary;
  }, {
    outOfStock: 0,
    critical: 0,
    low: 0,
    normal: 0,
  });
}

function buildSalesByStore(orders: AdminOrder[], stores: InventoryStore[]): StoreSalesMetric[] {
  const map = new Map<string, StoreSalesMetric>();
  stores.forEach((store) => {
    map.set(store.name, { storeName: store.name, total: 0, orders: 0, ticketAverage: 0 });
  });

  for (const order of orders) {
    const storeName = order.sourceStore?.name || 'Sin tienda';
    const row = map.get(storeName) || { storeName, total: 0, orders: 0, ticketAverage: 0 };
    row.orders += 1;
    row.total += toNumber(order.total);
    row.ticketAverage = row.orders > 0 ? row.total / row.orders : 0;
    map.set(storeName, row);
  }

  return Array.from(map.values())
    .filter((row) => row.orders > 0)
    .sort((a, b) => b.total - a.total);
}

function countPickingCompletedToday(orders: AdminOrder[]): number {
  return orders.filter((order) => {
    const sessionStatus = String(order.pickingSession?.status || '').toUpperCase();
    return sessionStatus === 'COMPLETED' || order.status === 'READY' || order.status === 'DELIVERED';
  }).length;
}

function computeAveragePreparationMinutes(orders: AdminOrder[]): number | null {
  const minutes = orders
    .map((order) => {
      if (String(order.pickingSession?.status || '').toUpperCase() !== 'COMPLETED') {
        return null;
      }
      const startedAt = getSafeDate(order.pickingSession?.createdAt);
      const endedAt = getSafeDate(order.pickingSession?.updatedAt);
      const diff = endedAt.getTime() - startedAt.getTime();
      return diff > 0 ? diff / (1000 * 60) : null;
    })
    .filter((value): value is number => Number.isFinite(value) && Number(value) > 0);

  if (minutes.length === 0) {
    return null;
  }
  return minutes.reduce((sum, value) => sum + value, 0) / minutes.length;
}

function buildPendingInbox(inbox: PendingInboxMetric): PendingTask[] {
  return [
    { key: 'to-confirm', label: 'Por confirmar', description: 'Pedidos nuevos sin confirmar', count: inbox.toConfirm, href: '/admin/orders/list?status=PENDING', tone: 'urgent' },
    { key: 'waiting-stock', label: 'Esperando stock', description: 'Con faltantes por reponer', count: inbox.waitingStock, href: '/admin/orders/list?status=WAITING_STOCK', tone: 'warn' },
    { key: 'to-pick', label: 'Falta separar', description: 'Confirmados sin picking', count: inbox.toPick, href: '/admin/orders/picking?status=CONFIRMED', tone: 'urgent' },
    { key: 'waiting-transfer', label: 'Confirmar traslado', description: 'Esperan traslado entre tiendas', count: inbox.waitingTransfer, href: '/admin/orders/list?status=WAITING_TRANSFER', tone: 'warn' },
    { key: 'transfers-receive', label: 'Traslados por recibir', description: 'Transferencias en transito', count: inbox.transfersToReceive, href: '/admin/transfers?status=TO_RECEIVE', tone: 'warn' },
    { key: 'preparing', label: 'Separando', description: 'Picking en progreso', count: inbox.preparing, href: '/admin/orders/picking?status=PREPARING', tone: 'info' },
    { key: 'ready', label: 'Por entregar', description: 'Listas sin entregar', count: inbox.ready, href: '/admin/orders/list?status=READY', tone: 'info' },
    { key: 'return-pending', label: 'Devoluciones', description: 'Pendientes por procesar', count: inbox.returnPending, href: '/admin/orders/list?status=RETURN_PENDING', tone: 'urgent' },
  ];
}

function getSalesTrendWidth(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) {
    return 0;
  }
  return Math.max(5, Math.min(100, (value / max) * 100));
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'Sin base';
  }
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function getTrendClass(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'neutral';
  }
  if (value > 0) {
    return 'positive';
  }
  if (value < 0) {
    return 'negative';
  }
  return 'neutral';
}

function normalizeStores(payload: unknown): InventoryStore[] {
  const raw = Array.isArray(payload)
    ? payload
    : (Array.isArray((payload as { data?: unknown[] } | null)?.data) ? (payload as { data: unknown[] }).data : []);

  return raw
    .map((item) => {
      const row = item as Partial<InventoryStore>;
      return {
        id: Number(row.id || 0),
        name: String(row.name || '').trim(),
        code: String(row.code || '').trim() || '-',
        isActive: row.isActive !== false,
      };
    })
    .filter((item) => Number.isInteger(item.id) && item.id > 0 && item.name);
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { method: 'GET', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = String((payload as { error?: unknown; message?: unknown } | null)?.error
      || (payload as { error?: unknown; message?: unknown } | null)?.message
      || 'No se pudo cargar la informacion.');
    throw new Error(message);
  }
  return payload;
}

export function AdminDashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<DashboardMetrics>(createEmptyMetrics);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Cargando dashboard...');
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const salesTrendMax = useMemo(() => Math.max(0, ...metrics.salesTrend.map((item) => item.total)), [metrics.salesTrend]);
  const weekTicket = metrics.weeklyOrders > 0 ? metrics.weeklySales / metrics.weeklyOrders : 0;
  const pendingTasks = useMemo(() => buildPendingInbox(metrics.pendingInbox), [metrics.pendingInbox]);
  const pendingTotal = useMemo(() => pendingTasks.reduce((total, task) => total + task.count, 0), [pendingTasks]);

  const fetchOrdersPaginated = useCallback(async (params: Record<string, string>): Promise<AdminOrder[]> => {
    const orders: AdminOrder[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const query = new URLSearchParams({
        ...params,
        page: String(page),
        limit: '100',
      });
      const payload = await fetchJson(`/api/admin/orders?${query.toString()}`);
      const normalized = normalizeOrdersListResponse(payload);
      orders.push(...normalized.data);
      totalPages = Math.max(1, normalized.pagination.totalPages);
      page += 1;
    } while (page <= totalPages && page <= 60);

    return orders;
  }, []);

  const fetchOrderCountByStatus = useCallback(async (status: AdminOrderStatus): Promise<number> => {
    const query = new URLSearchParams({
      page: '1',
      limit: '1',
      status,
    });
    const payload = await fetchJson(`/api/admin/orders?${query.toString()}`);
    return normalizeOrdersListResponse(payload).pagination.total;
  }, []);

  const fetchInventories = useCallback(async (): Promise<Inventory[]> => {
    const inventories: Inventory[] = [];
    const take = 400;
    let page = 1;

    while (page <= 10) {
      const payload = await fetchJson(`/api/admin/inventory?skip=${page}&take=${take}&includeZero=true`);
      const batch = normalizeInventoryList(payload);
      inventories.push(...batch);
      if (batch.length < take) {
        break;
      }
      page += 1;
    }

    return inventories;
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    setLoadingMessage('Cargando metricas de ventas...');

    try {
      const now = new Date();
      const todayRange = getDayRange(0);
      const yesterdayRange = getDayRange(-1);
      const weekRange = getCurrentWeekRange();
      const rollingStart = getDaysAgoStart(14);

      const [
        recentOrders,
        pendingCount,
        confirmedCount,
        waitingTransferCount,
        preparingCount,
        readyCount,
        returnPendingCount,
        waitingStockCount,
        inventories,
        transfersPayload,
        storesPayload,
      ] = await Promise.all([
        fetchOrdersPaginated({
          startDate: rollingStart.toISOString(),
          endDate: todayRange.end.toISOString(),
        }),
        fetchOrderCountByStatus('PENDING'),
        fetchOrderCountByStatus('CONFIRMED'),
        fetchOrderCountByStatus('WAITING_TRANSFER'),
        fetchOrderCountByStatus('PREPARING'),
        fetchOrderCountByStatus('READY'),
        fetchOrderCountByStatus('RETURN_PENDING'),
        fetchOrderCountByStatus('WAITING_STOCK'),
        fetchInventories(),
        fetchJson('/api/admin/inventory/transfers'),
        fetchJson('/api/admin/stores?skip=1&take=300&includeInactive=false'),
      ]);

      setLoadingMessage('Procesando metricas operativas...');
      const transfers = normalizeTransfers(transfersPayload) as StockTransfer[];
      const stores = normalizeStores(storesPayload);
      const todayOrders = filterOrdersByRange(recentOrders, todayRange.start, todayRange.end);
      const yesterdayOrders = filterOrdersByRange(recentOrders, yesterdayRange.start, yesterdayRange.end);
      const weekOrders = filterOrdersByRange(recentOrders, weekRange.start, weekRange.end);
      const todaySalesOrders = filterSalesOrders(todayOrders);
      const yesterdaySalesOrders = filterSalesOrders(yesterdayOrders);
      const weekSalesOrders = filterSalesOrders(weekOrders);
      const stockSummary = buildStockSummary(inventories);
      const transfersToReceive = transfers.filter((transfer) => transfer.status === 'PENDING' || transfer.status === 'IN_TRANSIT').length;
      const paidWithoutPicking = confirmedCount + waitingTransferCount;
      const overdueCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const overdue = recentOrders.filter((order) => (
        PENDING_ORDER_STATUSES.has(order.status) && getSafeDate(order.createdAt) < overdueCutoff
      )).length;

      setMetrics({
        salesToday: sumOrderTotals(todaySalesOrders),
        ordersToday: todaySalesOrders.length,
        avgTicketToday: todaySalesOrders.length > 0 ? sumOrderTotals(todaySalesOrders) / todaySalesOrders.length : 0,
        salesYesterday: sumOrderTotals(yesterdaySalesOrders),
        salesVsYesterdayPct: computePercentageChange(sumOrderTotals(yesterdaySalesOrders), sumOrderTotals(todaySalesOrders)),
        weeklySales: sumOrderTotals(weekSalesOrders),
        weeklyOrders: weekSalesOrders.length,
        salesByChannel: buildSalesByChannel(todaySalesOrders),
        salesTrend: buildSalesTrend(recentOrders),
        topProductsToday: aggregateTopSales(todaySalesOrders, 'product'),
        topProductsWeek: aggregateTopSales(weekSalesOrders, 'product'),
        topVariantsToday: aggregateTopSales(todaySalesOrders, 'variant'),
        topVariantsWeek: aggregateTopSales(weekSalesOrders, 'variant'),
        stockSummary,
        pendingOrders: {
          pending: pendingCount,
          paidWithoutPicking,
          pickingInProgress: preparingCount,
          readyToDeliver: readyCount,
          overdue,
        },
        pendingInbox: {
          toConfirm: pendingCount,
          waitingStock: waitingStockCount,
          toPick: confirmedCount,
          waitingTransfer: waitingTransferCount,
          transfersToReceive,
          preparing: preparingCount,
          ready: readyCount,
          returnPending: returnPendingCount,
        },
        picking: {
          completedToday: countPickingCompletedToday(todayOrders),
          avgPreparationMinutes: computeAveragePreparationMinutes(recentOrders),
        },
        salesByStore: buildSalesByStore(todaySalesOrders, stores),
      });
      setLastUpdated(new Date());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudieron cargar las metricas del dashboard.');
    } finally {
      setLoading(false);
    }
  }, [fetchInventories, fetchOrderCountByStatus, fetchOrdersPaginated]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  function goToInventoryStockScope(scope: StockScope) {
    router.push(`/admin/inventory?stockScope=${scope}&showAdvanced=1`);
  }

  function goToPickingBoard(status = '') {
    router.push(status ? `/admin/orders/picking?status=${status}` : '/admin/orders/picking');
  }

  function goToOverdueOrders() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    router.push(`/admin/orders/list?status=PENDING&endDate=${encodeURIComponent(cutoff.toISOString())}`);
  }

  function renderTopRows(rows: TopSaleMetric[], emptyLabel: string) {
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={3} data-label="Estado" className="dashboard-empty-cell-next">{emptyLabel}</td>
        </tr>
      );
    }
    return rows.map((item) => (
      <tr key={item.label}>
        <td data-label="Item">{item.label}</td>
        <td data-label="Cantidad">{item.quantity}</td>
        <td data-label="Total">{formatCurrency(item.total)}</td>
      </tr>
    ));
  }

  return (
    <section className="dashboard-page-next">
      <article className="admin-card dashboard-hero-next">
        <div>
          <p className="section-kicker">Panel operativo</p>
          <h1 className="section-title">Dashboard principal</h1>
          <p className="section-subtitle">Acciones pendientes, ventas, operacion y stock en tiempo real.</p>
        </div>
        <div className="dashboard-hero-actions-next">
          {lastUpdated ? <span>Actualizado: {formatShortDateTime(lastUpdated)}</span> : null}
          <button type="button" className="admin-primary-btn" disabled={loading} onClick={() => void loadDashboard()}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </article>

      {loading ? (
        <div className="admin-feedback info" role="status">{loadingMessage}</div>
      ) : null}

      {error ? (
        <div className="admin-feedback error" role="alert">{error}</div>
      ) : null}

      <section className="dashboard-kpi-grid-next">
        <article className="dashboard-kpi-card-next">
          <p>Ventas hoy</p>
          <strong>{formatCurrency(metrics.salesToday)}</strong>
          <span className={getTrendClass(metrics.salesVsYesterdayPct)}>vs ayer: {formatPercent(metrics.salesVsYesterdayPct)}</span>
        </article>
        <article className="dashboard-kpi-card-next">
          <p>Ventas semana</p>
          <strong>{formatCurrency(metrics.weeklySales)}</strong>
          <span>{metrics.weeklyOrders} ordenes</span>
        </article>
        <article className="dashboard-kpi-card-next">
          <p>Ordenes hoy</p>
          <strong>{metrics.ordersToday}</strong>
          <span>Pagadas o completadas</span>
        </article>
        <article className="dashboard-kpi-card-next">
          <p>Ticket promedio</p>
          <strong>{formatCurrency(metrics.avgTicketToday)}</strong>
          <span>Por orden del dia</span>
        </article>
        <button type="button" className="dashboard-kpi-card-next dashboard-click-card-next" onClick={() => goToInventoryStockScope('CRITICAL_TOTAL')}>
          <p>Productos criticos</p>
          <strong>{metrics.stockSummary.outOfStock + metrics.stockSummary.critical}</strong>
          <span>Ver inventario critico</span>
        </button>
      </section>

      <div className="dashboard-zone-head-next">
        <span className="section-kicker">Requiere atencion</span>
        <h2>Centro de acciones</h2>
      </div>

      {metrics.pendingOrders.overdue > 0 ? (
        <button type="button" className="dashboard-sla-banner-next" onClick={goToOverdueOrders}>
          <span className="dashboard-sla-icon-next" aria-hidden="true">!</span>
          <span className="dashboard-sla-text-next">
            <strong>{metrics.pendingOrders.overdue} pedidos atrasados</strong>
            <span>Mas de 24h sin cerrar. Revisar ahora.</span>
          </span>
          <span className="dashboard-sla-cta-next" aria-hidden="true">&rarr;</span>
        </button>
      ) : null}

      <article className="admin-card dashboard-panel-next dashboard-inbox-next">
        <div className="dashboard-panel-header-next">
          <h2>Pendientes por concretar</h2>
          <span>{pendingTotal} en cola</span>
        </div>
        <p className="admin-muted-text dashboard-inbox-hint-next">Acciones que faltan cerrar en la operacion. Toca una tarjeta para resolverla.</p>
        <div className="dashboard-inbox-grid-next">
          {pendingTasks.map((task) => (
            <button
              key={task.key}
              type="button"
              className={`dashboard-inbox-card-next tone-${task.tone} ${task.count > 0 ? 'has-value' : 'is-empty'}`}
              onClick={() => router.push(task.href)}
            >
              <strong>{task.count}</strong>
              <span className="dashboard-inbox-label-next">{task.label}</span>
              <span className="dashboard-inbox-desc-next">{task.description}</span>
            </button>
          ))}
        </div>
      </article>

      <div className="dashboard-zone-head-next">
        <span className="section-kicker">Rendimiento</span>
        <h2>Ventas</h2>
      </div>

      <section className="dashboard-grid-two-next">
        <article className="admin-card dashboard-panel-next">
          <div className="dashboard-panel-header-next">
            <h2>Ventas por canal</h2>
            <span>Hoy</span>
          </div>
          <div className="dashboard-channel-grid-next">
            {metrics.salesByChannel.map((item) => (
              <div key={item.channel} className="dashboard-channel-card-next">
                <p>{item.channel}</p>
                <strong>{formatCurrency(item.total)}</strong>
                <span>{item.orders} ordenes</span>
              </div>
            ))}
          </div>
          <div className="dashboard-week-summary-next">
            <p><strong>Semana:</strong> {metrics.weeklyOrders} ordenes</p>
            <p><strong>Ticket prom.:</strong> {formatCurrency(weekTicket)}</p>
          </div>
        </article>

        <article className="admin-card dashboard-panel-next">
          <div className="dashboard-panel-header-next">
            <h2>Ventas por dia</h2>
            <span>Ultimos 7 dias</span>
          </div>
          <div className="dashboard-trend-list-next">
            {metrics.salesTrend.length === 0 ? (
              <p className="admin-muted-text">Sin ventas recientes para mostrar.</p>
            ) : metrics.salesTrend.map((trend) => (
              <div key={trend.label} className="dashboard-trend-row-next">
                <div className="dashboard-trend-meta-next">
                  <strong>{trend.label}</strong>
                  <span>{trend.orders} ordenes</span>
                </div>
                <div className="dashboard-trend-bar-next">
                  <span style={{ width: `${getSalesTrendWidth(trend.total, salesTrendMax)}%` }} />
                </div>
                <strong>{formatCurrency(trend.total)}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <article className="admin-card dashboard-panel-next">
        <div className="dashboard-panel-header-next">
          <h2>Ventas por tienda</h2>
          <span>Hoy</span>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table">
            <thead>
              <tr>
                <th>Tienda</th>
                <th>Ventas</th>
                <th>Ordenes</th>
                <th>Ticket promedio</th>
              </tr>
            </thead>
            <tbody>
              {metrics.salesByStore.length === 0 ? (
                <tr>
                  <td colSpan={4} data-label="Estado" className="dashboard-empty-cell-next">Sin ventas por tienda para hoy.</td>
                </tr>
              ) : metrics.salesByStore.map((row) => (
                <tr key={row.storeName}>
                  <td data-label="Tienda">{row.storeName}</td>
                  <td data-label="Ventas">{formatCurrency(row.total)}</td>
                  <td data-label="Ordenes">{row.orders}</td>
                  <td data-label="Ticket promedio">{formatCurrency(row.ticketAverage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <div className="dashboard-zone-head-next">
        <span className="section-kicker">Operacion</span>
        <h2>Inventario y preparacion</h2>
      </div>

      <section className="dashboard-grid-two-next">
        <article className="admin-card dashboard-panel-next">
          <div className="dashboard-panel-header-next">
            <h2>Stock por nivel</h2>
          </div>
          <div className="dashboard-stock-grid-next">
            <button type="button" className="dashboard-stock-card-next out" onClick={() => goToInventoryStockScope('OUT')}>
              <span>Sin stock</span>
              <strong>{metrics.stockSummary.outOfStock}</strong>
            </button>
            <button type="button" className="dashboard-stock-card-next critical" onClick={() => goToInventoryStockScope('CRITICAL')}>
              <span>Critico (1-3)</span>
              <strong>{metrics.stockSummary.critical}</strong>
            </button>
            <button type="button" className="dashboard-stock-card-next low" onClick={() => goToInventoryStockScope('LOW')}>
              <span>Bajo (4-10)</span>
              <strong>{metrics.stockSummary.low}</strong>
            </button>
            <button type="button" className="dashboard-stock-card-next normal" onClick={() => goToInventoryStockScope('NORMAL')}>
              <span>Normal</span>
              <strong>{metrics.stockSummary.normal}</strong>
            </button>
          </div>
        </article>

        <article className="admin-card dashboard-panel-next">
          <div className="dashboard-panel-header-next">
            <h2>Productividad de preparacion</h2>
            <span>Hoy</span>
          </div>
          <div className="dashboard-ops-grid-next">
            <button type="button" onClick={() => goToPickingBoard('READY')}>
              <span>Picking completado</span>
              <strong>{metrics.picking.completedToday}</strong>
            </button>
            <button type="button" onClick={() => goToPickingBoard()}>
              <span>Tiempo prom.</span>
              <strong>{metrics.picking.avgPreparationMinutes === null ? '--' : `${Math.round(metrics.picking.avgPreparationMinutes)} min`}</strong>
            </button>
            <button type="button" onClick={() => router.push('/admin/orders/list')}>
              <span>Pedidos en cola</span>
              <strong>{pendingTotal}</strong>
            </button>
          </div>
        </article>
      </section>

      <div className="dashboard-zone-head-next">
        <span className="section-kicker">Analisis</span>
        <h2>Productos mas vendidos</h2>
      </div>

      <section className="dashboard-grid-two-next">
        <article className="admin-card dashboard-panel-next">
          <div className="dashboard-panel-header-next">
            <h2>Top productos vendidos</h2>
          </div>
          <div className="dashboard-table-pair-next">
            <div>
              <h3>Hoy</h3>
              <div className="admin-table-wrap">
                <table className="admin-table mobile-card-table">
                  <thead>
                    <tr><th>Producto</th><th>Cant.</th><th>Total</th></tr>
                  </thead>
                  <tbody>{renderTopRows(metrics.topProductsToday, 'Sin datos de hoy.')}</tbody>
                </table>
              </div>
            </div>
            <div>
              <h3>Semana</h3>
              <div className="admin-table-wrap">
                <table className="admin-table mobile-card-table">
                  <thead>
                    <tr><th>Producto</th><th>Cant.</th><th>Total</th></tr>
                  </thead>
                  <tbody>{renderTopRows(metrics.topProductsWeek, 'Sin datos de semana.')}</tbody>
                </table>
              </div>
            </div>
          </div>
        </article>

        <article className="admin-card dashboard-panel-next">
          <div className="dashboard-panel-header-next">
            <h2>Top variantes vendidas</h2>
          </div>
          <div className="dashboard-table-pair-next">
            <div>
              <h3>Hoy</h3>
              <div className="admin-table-wrap">
                <table className="admin-table mobile-card-table">
                  <thead>
                    <tr><th>Variante</th><th>Cant.</th><th>Total</th></tr>
                  </thead>
                  <tbody>{renderTopRows(metrics.topVariantsToday, 'Sin datos de hoy.')}</tbody>
                </table>
              </div>
            </div>
            <div>
              <h3>Semana</h3>
              <div className="admin-table-wrap">
                <table className="admin-table mobile-card-table">
                  <thead>
                    <tr><th>Variante</th><th>Cant.</th><th>Total</th></tr>
                  </thead>
                  <tbody>{renderTopRows(metrics.topVariantsWeek, 'Sin datos de semana.')}</tbody>
                </table>
              </div>
            </div>
          </div>
        </article>
      </section>

      <article className="admin-card dashboard-shortcuts-next">
        <div>
          <h2>Accesos rapidos</h2>
          <p className="admin-muted-text">Modulos principales para continuar la operacion.</p>
        </div>
        <div className="admin-link-grid">
          <Link href="/admin/orders/list" className="admin-link-card"><strong>Pedidos</strong><span>Listado y filtros de ordenes.</span></Link>
          <Link href="/admin/orders/pos" className="admin-link-card"><strong>POS</strong><span>Crear ventas desde tienda.</span></Link>
          <Link href="/admin/orders/picking" className="admin-link-card"><strong>Picking</strong><span>Preparacion de pedidos.</span></Link>
          <Link href="/admin/inventory" className="admin-link-card"><strong>Inventario</strong><span>Stock, reservas y movimientos.</span></Link>
          <Link href="/admin/transfers" className="admin-link-card"><strong>Transferencias</strong><span>Movimientos entre tiendas.</span></Link>
          <Link href="/admin/product" className="admin-link-card"><strong>Productos</strong><span>Catalogo y variantes.</span></Link>
        </div>
      </article>
    </section>
  );
}
