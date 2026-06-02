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

interface AdminAlert {
  id: string;
  type: AlertType;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  acceptText?: string;
  cancelText?: string;
}

interface AdminUiContextValue {
  showAlert: (message: string, type?: AlertType, durationMs?: number) => void;
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
  const [alert, setAlert] = useState<AdminAlert | null>(null);
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);
  const alertCounterRef = useRef(0);
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  const closeAlert = useCallback(() => {
    if (alertTimerRef.current) {
      clearTimeout(alertTimerRef.current);
      alertTimerRef.current = null;
    }
    setAlert(null);
  }, []);

  const showAlert = useCallback(
    (message: string, type: AlertType = 'info', durationMs = 3000) => {
      if (alertTimerRef.current) {
        clearTimeout(alertTimerRef.current);
        alertTimerRef.current = null;
      }

      const id = `alert-${++alertCounterRef.current}`;
      setAlert({ id, type, message });

      if (durationMs > 0) {
        alertTimerRef.current = setTimeout(() => {
          setAlert(null);
          alertTimerRef.current = null;
        }, durationMs);
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
      if (alertTimerRef.current) {
        clearTimeout(alertTimerRef.current);
        alertTimerRef.current = null;
      }
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

      {alert ? (
        <div className="admin-alert-root" role="status" aria-live="polite">
          <div className={`admin-alert admin-alert-${alert.type}`}>
            <div className="admin-alert-body">
              <strong>{getAlertTitle(alert.type)}</strong>
              <p>{alert.message}</p>
            </div>
            <button type="button" className="admin-alert-close" onClick={closeAlert}>
              Cerrar
            </button>
          </div>
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
