'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export interface AdminAuthUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  permissions: string[];
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
  };

  const id = Number(user.id);
  if (!Number.isInteger(id) || id < 1) {
    return null;
  }

  const permissions = Array.isArray(user.permissions)
    ? normalizePermissionList(user.permissions)
    : [];

  return {
    id,
    firstName: String(user.firstName || '').trim(),
    lastName: String(user.lastName || '').trim(),
    email: String(user.email || '').trim(),
    role: String(user.role || '').trim() || 'USER',
    permissions,
  };
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AdminAuthUser | null>(null);

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
        return;
      }
      setUser(normalizeAuthUser(payload));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

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

