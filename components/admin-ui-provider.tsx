'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type AlertType = 'success' | 'error' | 'warning' | 'info';

interface AdminAlertAction {
  label: string;
  onClick: () => void;
}

interface AdminAlert {
  id: string;
  type: AlertType;
  message: string;
  action?: AdminAlertAction;
}

interface ConfirmOptions {
  title: string;
  message: string;
  acceptText?: string;
  cancelText?: string;
}

interface AdminUiContextValue {
  showAlert: (message: string, type?: AlertType, durationMs?: number, action?: AdminAlertAction) => void;
  closeAlert: () => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const AdminUiContext = createContext<AdminUiContextValue | null>(null);

function getAlertTitle(type: AlertType): string {
  switch (type) {
    case 'success':
      return 'Exito';
    case 'error':
      return 'Error';
    case 'warning':
      return 'Advertencia';
    default:
      return 'Informacion';
  }
}

export function AdminUiProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);
  const alertCounterRef = useRef(0);
  const alertTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  const removeAlert = useCallback((id: string) => {
    const timer = alertTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      alertTimersRef.current.delete(id);
    }
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  }, []);

  const closeAlert = useCallback(() => {
    for (const timer of alertTimersRef.current.values()) clearTimeout(timer);
    alertTimersRef.current.clear();
    setAlerts([]);
  }, []);

  const showAlert = useCallback(
    (message: string, type: AlertType = 'info', durationMs = 3000, action?: AdminAlertAction) => {
      const id = `alert-${++alertCounterRef.current}`;
      setAlerts((current) => [{ id, type, message, action }, ...current]);

      if (durationMs > 0) {
        const timer = setTimeout(() => {
          alertTimersRef.current.delete(id);
          setAlerts((current) => current.filter((alert) => alert.id !== id));
        }, durationMs);
        alertTimersRef.current.set(id, timer);
      }
    },
    [],
  );

  const closeConfirm = useCallback((accepted: boolean) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmOptions(null);
    if (resolver) {
      resolver(accepted);
    }
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmOptions(options);
    });
  }, []);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && confirmOptions) {
        closeConfirm(false);
      }
    }

    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
    };
  }, [closeConfirm, confirmOptions]);

  useEffect(() => {
    return () => {
      for (const timer of alertTimersRef.current.values()) clearTimeout(timer);
      alertTimersRef.current.clear();
      if (confirmResolverRef.current) {
        confirmResolverRef.current(false);
        confirmResolverRef.current = null;
      }
    };
  }, []);

  const contextValue = useMemo<AdminUiContextValue>(
    () => ({
      showAlert,
      closeAlert,
      confirm,
    }),
    [showAlert, closeAlert, confirm],
  );

  return (
    <AdminUiContext.Provider value={contextValue}>
      {children}

      {alerts.length > 0 ? (
        <div className="admin-alert-root" role="status" aria-live="polite">
          {alerts.map((alert) => (
            <div className={`admin-alert admin-alert-${alert.type}`} key={alert.id}>
              <div className="admin-alert-body">
                <strong>{getAlertTitle(alert.type)}</strong>
                <p>{alert.message}</p>
              </div>
              {alert.action ? (
                <button
                  type="button"
                  className="admin-alert-action"
                  onClick={() => {
                    const handler = alert.action?.onClick;
                    removeAlert(alert.id);
                    handler?.();
                  }}
                >
                  {alert.action.label}
                </button>
              ) : null}
              <button type="button" className="admin-alert-close" onClick={() => removeAlert(alert.id)}>
                Cerrar
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {confirmOptions ? (
        <div className="admin-confirm-overlay" role="presentation" onClick={() => closeConfirm(false)}>
          <div
            className="admin-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="admin-confirm-title">{confirmOptions.title}</h3>
            <p>{confirmOptions.message}</p>
            <div className="admin-confirm-actions">
              <button type="button" className="admin-ghost-btn" onClick={() => closeConfirm(false)}>
                {confirmOptions.cancelText || 'Cancelar'}
              </button>
              <button type="button" className="admin-primary-btn" onClick={() => closeConfirm(true)}>
                {confirmOptions.acceptText || 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminUiContext.Provider>
  );
}

export function useAdminUi() {
  const context = useContext(AdminUiContext);
  if (!context) {
    throw new Error('useAdminUi debe usarse dentro de AdminUiProvider.');
  }
  return context;
}
