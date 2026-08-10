'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAdminAuth } from '@/components/admin-auth-provider';

const ADMIN_THEME_KEY = 'admin_theme';
const MOBILE_MEDIA_QUERY = '(max-width: 960px)';
const NOTIFICATION_REFRESH_MS = 45_000;
export const ADMIN_LIVE_UPDATE_EVENT = 'admin-live-update';

type AdminTheme = 'dark' | 'light';

export interface AdminLiveUpdateDetail {
  type?: string;
  entity?: string;
  entityId?: number | null;
  entityCode?: string | null;
  status?: string | null;
  timestamp?: string;
}

export interface PendingAssignment {
  orderId: number;
  orderCode: string;
  title: string;
  detail: string;
  units: number;
  acceptanceStatus: 'PENDING' | 'ACCEPTED';
  createdAt: string | null;
}

interface AdminShellContextValue {
  theme: AdminTheme;
  isMobile: boolean;
  isSidebarOpen: boolean;
  isSidebarCollapsed: boolean;
  pendingAssignments: PendingAssignment[];
  loadingNotifications: boolean;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebarCollapsed: () => void;
  refreshPendingAssignments: () => Promise<void>;
}

const AdminShellContext = createContext<AdminShellContextValue | null>(null);

function normalizeTheme(value: string | null | undefined): AdminTheme {
  return value === 'dark' ? 'dark' : 'light';
}

function getPendingReturnUnits(order: Record<string, unknown>): number {
  const items = Array.isArray(order.items) ? order.items : [];

  const totalPicked = items.reduce((sum, item) => {
    const row = item as Record<string, unknown>;
    const picked = Number(row.pickedQuantity ?? row.picked ?? 0);
    return sum + Math.max(0, Number.isFinite(picked) ? picked : 0);
  }, 0);

  if (totalPicked > 0) {
    return totalPicked;
  }

  const totalReserved = items.reduce((sum, item) => {
    const row = item as Record<string, unknown>;
    const reserved = Number(row.reservedQuantity ?? row.reserved ?? 0);
    return sum + Math.max(0, Number.isFinite(reserved) ? reserved : 0);
  }, 0);

  if (totalReserved > 0) {
    return totalReserved;
  }

  const reservations = Array.isArray(order.reservations) ? order.reservations : [];
  return reservations.reduce((sum, row) => {
    const reservation = row as Record<string, unknown>;
    const status = String(reservation.status || '').toUpperCase();
    if (status !== 'ACTIVE') {
      return sum;
    }
    const quantity = Number(reservation.quantity || 0);
    return sum + Math.max(0, Number.isFinite(quantity) ? quantity : 0);
  }, 0);
}

function mapPendingAssignments(payload: unknown, userId: number): PendingAssignment[] {
  const data = Array.isArray((payload as { data?: unknown[] } | null)?.data)
    ? (payload as { data: unknown[] }).data
    : [];

  return data
    .map((row) => row as Record<string, unknown>)
    .filter((order) => Number((order.returnWorkflow as { responsible?: { id?: unknown } } | undefined)?.responsible?.id || 0) === userId)
    .map((order) => {
      const returnWorkflow = (order.returnWorkflow as Record<string, unknown> | undefined) || {};
      const acceptance = String(returnWorkflow.acceptanceStatus || '').toUpperCase() === 'ACCEPTED'
        ? 'ACCEPTED'
        : 'PENDING';
      const units = getPendingReturnUnits(order);
      const client = String(order.clientName || order.clientEmail || 'Cliente').trim();
      const orderId = Number(order.id || 0);
      return {
        orderId,
        orderCode: String(order.code || 'SIN-CODIGO'),
        title: acceptance === 'PENDING'
          ? 'Devolucion delegada pendiente de aceptar'
          : 'Devolucion pendiente de cerrar',
        detail: `${client} - ${units} und. por devolver`,
        units,
        acceptanceStatus: acceptance,
        createdAt: String(returnWorkflow.requestedAt || order.updatedAt || '').trim() || null,
      } satisfies PendingAssignment;
    })
    .filter((assignment) => Number.isInteger(assignment.orderId) && assignment.orderId > 0)
    .sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
}

export function AdminShellProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAdminAuth();
  const [theme, setTheme] = useState<AdminTheme>('light');
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [pendingAssignments, setPendingAssignments] = useState<PendingAssignment[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedTheme = normalizeTheme(window.localStorage.getItem(ADMIN_THEME_KEY));
    setTheme(storedTheme);
    document.documentElement.setAttribute('data-theme', storedTheme);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(ADMIN_THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const update = () => {
      const mobile = mediaQuery.matches;
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpen(false);
      }
    };

    update();
    mediaQuery.addEventListener('change', update);
    return () => {
      mediaQuery.removeEventListener('change', update);
    };
  }, []);

  const refreshPendingAssignments = useCallback(async () => {
    const userId = Number(user?.id || 0);
    if (!Number.isInteger(userId) || userId < 1) {
      setPendingAssignments([]);
      return;
    }

    setLoadingNotifications(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '50',
        status: 'RETURN_PENDING',
        responsibleUserId: String(userId),
      });

      const response = await fetch(`/api/admin/orders?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      }).catch(() => null);

      if (!response) {
        setPendingAssignments([]);
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setPendingAssignments([]);
        return;
      }

      setPendingAssignments(mapPendingAssignments(payload, userId));
    } finally {
      setLoadingNotifications(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refreshPendingAssignments();
    const timer = setInterval(() => {
      refreshPendingAssignments();
    }, NOTIFICATION_REFRESH_MS);

    return () => {
      clearInterval(timer);
    };
  }, [refreshPendingAssignments]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return undefined;
    }

    const userId = Number(user?.id || 0);
    if (!Number.isInteger(userId) || userId < 1) {
      return undefined;
    }

    let refreshTimer: number | null = null;
    const eventSource = new EventSource('/api/admin/events/stream');

    const refreshSoon = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(() => {
        void refreshPendingAssignments();
      }, 120);
    };

    const onAdminUpdate = (event: MessageEvent<string>) => {
      try {
        const detail = JSON.parse(event.data || '{}') as AdminLiveUpdateDetail;
        refreshSoon();
        window.dispatchEvent(new CustomEvent<AdminLiveUpdateDetail>(ADMIN_LIVE_UPDATE_EVENT, { detail }));
      } catch {
        refreshSoon();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshSoon();
      }
    };

    eventSource.addEventListener('admin-update', onAdminUpdate);
    window.addEventListener('focus', refreshSoon);
    window.addEventListener('online', refreshSoon);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      eventSource.removeEventListener('admin-update', onAdminUpdate);
      eventSource.close();
      window.removeEventListener('focus', refreshSoon);
      window.removeEventListener('online', refreshSoon);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshPendingAssignments, user?.id]);

  const openSidebar = useCallback(() => {
    setIsSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setIsSidebarOpen((current) => !current);
      return;
    }
    setIsSidebarCollapsed((current) => !current);
  }, [isMobile]);

  const toggleSidebarCollapsed = useCallback(() => {
    setIsSidebarCollapsed((current) => !current);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo<AdminShellContextValue>(() => ({
    theme,
    isMobile,
    isSidebarOpen,
    isSidebarCollapsed,
    pendingAssignments,
    loadingNotifications,
    toggleTheme,
    toggleSidebar,
    openSidebar,
    closeSidebar,
    toggleSidebarCollapsed,
    refreshPendingAssignments,
  }), [
    closeSidebar,
    isMobile,
    isSidebarCollapsed,
    isSidebarOpen,
    loadingNotifications,
    openSidebar,
    pendingAssignments,
    refreshPendingAssignments,
    theme,
    toggleSidebar,
    toggleSidebarCollapsed,
    toggleTheme,
  ]);

  return (
    <AdminShellContext.Provider value={value}>
      {children}
    </AdminShellContext.Provider>
  );
}

export function useAdminShell() {
  const context = useContext(AdminShellContext);
  if (!context) {
    throw new Error('useAdminShell debe usarse dentro de AdminShellProvider.');
  }
  return context;
}
