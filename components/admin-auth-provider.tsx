'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface AdminAuthUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  permissions: string[];
  tenant: {
    id: string;
    slug: string;
    name: string;
    status: string;
  };
  membership: {
    id: string;
    role: string;
    status: string;
  };
}

interface AdminAuthContextValue {
  loading: boolean;
  user: AdminAuthUser | null;
  permissions: string[];
  hasPermission: (required?: string | string[] | null) => boolean;
  refreshUser: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

function normalizePermissionList(values: unknown[]): string[] {
  const unique = new Set<string>();
  values.forEach((value) => {
    const permission = String(value || '').trim().toLowerCase();
    if (permission) {
      unique.add(permission);
    }
  });
  return Array.from(unique.values());
}

function normalizeAuthUser(payload: unknown): AdminAuthUser | null {
  const raw = (payload as { user?: unknown } | null)?.user;
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const user = raw as {
    id?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    email?: unknown;
    role?: unknown;
    permissions?: unknown;
    tenant?: unknown;
    membership?: unknown;
  };

  const id = Number(user.id);
  if (!Number.isInteger(id) || id < 1) {
    return null;
  }

  const permissions = Array.isArray(user.permissions)
    ? normalizePermissionList(user.permissions)
    : [];
  const tenant = user.tenant as Record<string, unknown> | null;
  const membership = user.membership as Record<string, unknown> | null;
  if (!tenant || !membership || !tenant.id || !tenant.slug || !tenant.name || !membership.id) {
    return null;
  }

  return {
    id,
    firstName: String(user.firstName || '').trim(),
    lastName: String(user.lastName || '').trim(),
    email: String(user.email || '').trim(),
    role: String(user.role || '').trim() || 'USER',
    permissions,
    tenant: {
      id: String(tenant.id),
      slug: String(tenant.slug),
      name: String(tenant.name),
      status: String(tenant.status || ''),
    },
    membership: {
      id: String(membership.id),
      role: String(membership.role || ''),
      status: String(membership.status || ''),
    },
  };
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/admin/dashboard';
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AdminAuthUser | null>(null);
  const redirectingToLoginRef = useRef(false);

  const redirectToLogin = useCallback(() => {
    if (redirectingToLoginRef.current) {
      return;
    }

    redirectingToLoginRef.current = true;
    const returnUrl = typeof window === 'undefined'
      ? pathname
      : `${window.location.pathname}${window.location.search}`;
    const loginUrl = `/login?returnUrl=${encodeURIComponent(returnUrl.startsWith('/admin') ? returnUrl : pathname)}`;
    router.replace(loginUrl);
    router.refresh();
  }, [pathname, router]);

  const refreshUser = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/auth/me', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setUser(null);
        if (response.status === 401) {
          redirectToLogin();
        }
        return;
      }
      setUser(normalizeAuthUser(payload));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [redirectToLogin]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.pathname
          : input.url;
      const path = url.startsWith('http') ? new URL(url).pathname : url;
      const isAdminApi = path.startsWith('/api/admin/');
      const isSessionEndpoint = path.startsWith('/api/admin/session');

      if (response.status === 401 && isAdminApi && !isSessionEndpoint) {
        setUser(null);
        void originalFetch('/api/admin/session', { method: 'DELETE' }).finally(() => {
          redirectToLogin();
        });
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [redirectToLogin]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const permissions = useMemo(() => normalizePermissionList(user?.permissions || []), [user]);

  const hasPermission = useCallback((required?: string | string[] | null) => {
    if (!required) {
      return true;
    }

    if (!user) {
      return false;
    }

    if (permissions.includes('*')) {
      return true;
    }

    const requiredList = Array.isArray(required) ? required : [required];
    return requiredList
      .map((permission) => String(permission || '').trim().toLowerCase())
      .filter(Boolean)
      .some((permission) => permissions.includes(permission));
  }, [permissions, user]);

  const contextValue = useMemo<AdminAuthContextValue>(() => ({
    loading,
    user,
    permissions,
    hasPermission,
    refreshUser,
  }), [hasPermission, loading, permissions, refreshUser, user]);

  return (
    <AdminAuthContext.Provider value={contextValue}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth debe usarse dentro de AdminAuthProvider.');
  }
  return context;
}
