'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminUi } from '@/components/admin-ui-provider';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { AdminOrder, AdminOrderItem, AdminOrderItemReservationSuggestion } from '@/lib/admin-order-types';
import {
  LineInput,
  LineState,
  computeStats,
  findSplitCandidate,
  getHeaderState,
  getLineState as getLineStateLogic,
  nextStepValue,
  resolveVariantSuggestions,
} from '@/lib/fulfillment-logic';

// ---------------------------------------------------------------------------
// Tipos locales (estado que vive en el cliente)
// ---------------------------------------------------------------------------

interface StoreQty {
  storeId: number;
  quantity: number;
}

interface ActivityEntry {
  id: string;
  at: string;
  user: string;
  text: string;
}

interface CatalogVariant {
  id: number;
  sku: string;
  colorName: string;
  colorHex: string | null;
  sizeName: string;
  price: number;
  // Variante virtual marketplace: `id` es sintetico y `sourceVariantId` apunta a
  // la variante fisica real que se envia al backend (mas el color/talla como guide).
  sourceVariantId?: number;
  isVirtual?: boolean;
}

interface CatalogProduct {
  id: number;
  name: string;
  variants: CatalogVariant[];
}

interface DraftPayload {
  // ledger = espejo local de lo reservado por tienda (el backend no distingue
  // por item cuando varias lineas comparten la misma variante).
  ledger?: Record<string, StoreQty[]>;
  activity?: ActivityEntry[];
}

const SYNC_DEBOUNCE_MS = 1500;

const REMOVE_REASONS = [
  'Sin stock',
  'Producto defectuoso',
  'Cliente cancelo',
  'Error de inventario',
  'Otro',
];

const STATE_META: Record<LineState, { label: string; tone: string }> = {
  pendiente: { label: 'Pendiente', tone: 'gray' },
  configurado: { label: 'Configurado', tone: 'blue' },
  parcial: { label: 'Parcial', tone: 'amber' },
  reservado: { label: 'Reservado', tone: 'green' },
  sin_stock: { label: 'Sin stock', tone: 'red' },
};

// ---------------------------------------------------------------------------
// Helpers de cantidades
// ---------------------------------------------------------------------------

function getRequested(item: AdminOrderItem): number {
  return Math.max(0, Number(item.requestedQuantity ?? item.quantity ?? 0));
}

function getReserved(item: AdminOrderItem): number {
  return Math.max(0, Number(item.reservedQuantity ?? item.reserved ?? 0));
}

function rawSuggestions(item: AdminOrderItem): AdminOrderItemReservationSuggestion[] {
  // Recomendada = mayor disponibilidad.
  return [...(item.reservationSuggestions || [])].sort((a, b) => b.availableStock - a.availableStock);
}

/**
 * Sugerencias efectivas de un item uniendo las de todas las lineas que comparten
 * la misma variante ("producto unico": varias filas Color/Talla = mismo SKU y
 * mismo stock). Asi una linea sin sugerencias propias hereda las tiendas con
 * stock de sus hermanas y no aparece como "sin stock" por error.
 */
function mergedSuggestions(item: AdminOrderItem, allItems: AdminOrderItem[]): AdminOrderItemReservationSuggestion[] {
  return resolveVariantSuggestions(
    Number(item.variantId),
    allItems.map((other) => ({ variantId: Number(other.variantId), suggestions: rawSuggestions(other) })),
  );
}

function getStoreName(suggestions: AdminOrderItemReservationSuggestion[], storeId: number, item: AdminOrderItem): string {
  return suggestions.find((s) => s.storeId === storeId)?.storeName
    || (Number(item.fulfillmentStoreId) === storeId ? String(item.fulfillmentStore?.name || '') : '')
    || `Tienda ${storeId}`;
}

function getStoreAvailable(suggestions: AdminOrderItemReservationSuggestion[], storeId: number): number {
  return Math.max(0, suggestions.find((s) => s.storeId === storeId)?.availableStock || 0);
}

function nowIso(): string {
  return new Date().toISOString();
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function sumQty(rows: StoreQty[]): number {
  return rows.reduce((sum, r) => sum + Math.max(0, r.quantity), 0);
}

/**
 * Reserva comprometida por tienda para un item, reconciliada con el total real
 * `item.reserved`. Si el espejo local (ledger) cuadra con el total, se usa; si
 * no (cambio externo), se reconstruye poniendo todo en la tienda principal.
 */
function committedRowsFrom(
  item: AdminOrderItem,
  ledger: Record<number, StoreQty[]>,
  suggestions: AdminOrderItemReservationSuggestion[],
): StoreQty[] {
  const reserved = getReserved(item);
  // Ledger del backend (multi-dispositivo): fuente de verdad del reparto por
  // tienda si su suma cuadra con el total reservado. Prevalece sobre el espejo
  // local (localStorage), que ahora es solo fallback para reservas legacy.
  const serverRows = Array.isArray(item.reservedByStore) ? item.reservedByStore : [];
  const serverSum = serverRows.reduce((sum, r) => sum + Math.max(0, Number(r.quantity) || 0), 0);
  if (serverRows.length > 0 && serverSum === reserved) {
    return serverRows
      .map((r) => ({ storeId: Number(r.storeId), quantity: Math.max(0, Number(r.quantity) || 0) }))
      .filter((r) => r.quantity > 0);
  }
  const saved = ledger[item.id];
  if (saved && sumQty(saved) === reserved) {
    return saved.filter((r) => r.quantity > 0);
  }
  if (reserved > 0) {
    const storeId = Number(item.fulfillmentStoreId || 0) || suggestions[0]?.storeId || 0;
    return storeId ? [{ storeId, quantity: reserved }] : [];
  }
  return [];
}

/** Normaliza la respuesta de /api/admin/products al catalogo minimo del selector. */
function normalizeCatalog(payload: unknown): CatalogProduct[] {
  const container = payload as { data?: unknown } | null;
  const rows = Array.isArray(container?.data)
    ? container!.data
    : (Array.isArray(payload) ? payload : []);

  const products: CatalogProduct[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const id = Number(row?.id);
    if (!Number.isInteger(id) || id < 1) {
      continue;
    }
    // Para productos SIMPLE con config marketplace, el backend expone las variantes
    // virtuales (color/talla) en `marketplaceVariants`; se prefieren sobre la unica
    // variante fisica para que el operador elija la misma variante que el cliente.
    const marketplaceVariantsRaw = Array.isArray(row?.marketplaceVariants) ? row.marketplaceVariants : [];
    const useMarketplace = marketplaceVariantsRaw.length > 0;
    const variantsRaw = (useMarketplace ? marketplaceVariantsRaw : (Array.isArray(row?.variants) ? row.variants : [])) as Array<Record<string, unknown>>;
    const variants: CatalogVariant[] = [];
    for (const vr of variantsRaw) {
      const variantId = Number(vr?.id);
      if (!Number.isInteger(variantId) || variantId < 1) {
        continue;
      }
      const price = Math.max(0, Number(vr?.price || 0));
      const color = vr?.color as { name?: unknown; hex?: unknown } | undefined;
      const size = vr?.size as { name?: unknown } | undefined;
      const sourceVariantId = Number(vr?.sourceVariantId || 0);
      const hex = String(color?.hex || '').trim();
      variants.push({
        id: variantId,
        sku: String(vr?.sku || `VAR-${variantId}`),
        colorName: String(color?.name || 'Sin color'),
        colorHex: hex ? hex : null,
        sizeName: String(size?.name || 'Sin talla'),
        price,
        sourceVariantId: sourceVariantId > 0 ? sourceVariantId : undefined,
        isVirtual: useMarketplace,
      });
    }
    if (variants.length === 0) {
      continue;
    }
    products.push({ id, name: String(row?.name || `Producto #${id}`), variants });
  }
  return products.sort((a, b) => a.name.localeCompare(b.name));
}

interface EcommerceFulfillmentPanelProps {
  order: AdminOrder;
  canEdit: boolean;
  onReload: () => Promise<void> | void;
}

export function EcommerceFulfillmentPanel({ order, canEdit, onReload }: EcommerceFulfillmentPanelProps) {
  const router = useRouter();
  const { showAlert } = useAdminUi();
  const { user } = useAdminAuth();
  const currentUserName = useMemo(() => {
    const name = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
    return name || 'Operador';
  }, [user?.firstName, user?.lastName]);

  const storageKey = `mk-fulfillment-v3:${order.id}`;

  // ledger: espejo local de reservado por tienda. overrides: valor optimista
  // mientras se confirma con el backend (debounce).
  const [ledger, setLedgerState] = useState<Record<number, StoreQty[]>>({});
  const [overrides, setOverridesState] = useState<Record<string, number>>({});
  const [extraStores, setExtraStores] = useState<Record<number, number[]>>({});
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [removingItemId, setRemovingItemId] = useState<number | null>(null);
  const [restoringItemId, setRestoringItemId] = useState<number | null>(null);
  const [syncingLines, setSyncingLines] = useState<number[]>([]);
  const [releasingItemId, setReleasingItemId] = useState<number | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [reservingAll, setReservingAll] = useState(false);
  const [deleteModalItemId, setDeleteModalItemId] = useState<number | null>(null);
  const [deleteReason, setDeleteReason] = useState(REMOVE_REASONS[0]);
  const [deleteNote, setDeleteNote] = useState('');
  const [showRemovedPanel, setShowRemovedPanel] = useState(false);
  const [openRowMenuId, setOpenRowMenuId] = useState<number | null>(null);

  // --- Agregar producto a la proforma ------------------------------------
  const [showAddModal, setShowAddModal] = useState(false);
  const [addCatalog, setAddCatalog] = useState<CatalogProduct[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addProductId, setAddProductId] = useState<number | null>(null);
  const [addVariantId, setAddVariantId] = useState<number | null>(null);
  const [addQty, setAddQty] = useState(1);
  const [addingProduct, setAddingProduct] = useState(false);

  const ledgerRef = useRef<Record<number, StoreQty[]>>({});
  const overridesRef = useRef<Record<string, number>>({});
  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());
  const dirtyRef = useRef<Set<string>>(new Set());
  const activityRef = useRef<ActivityEntry[]>([]);
  const hydratedRef = useRef(false);
  // Timers de acciones diferidas con ventana de "Deshacer" (por item).
  const undoTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const keyOf = (itemId: number, storeId: number) => `${itemId}:${storeId}`;

  // --- Persistencia ------------------------------------------------------
  const persist = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const payload: DraftPayload = {
        ledger: Object.fromEntries(Object.entries(ledgerRef.current)),
        activity: activityRef.current,
      };
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // localStorage lleno o no disponible: ignorar.
    }
  }, [storageKey]);

  const setLedger = useCallback((updater: (prev: Record<number, StoreQty[]>) => Record<number, StoreQty[]>) => {
    setLedgerState((prev) => {
      const next = updater(prev);
      ledgerRef.current = next;
      persist();
      return next;
    });
  }, [persist]);

  const setOverrides = useCallback((updater: (prev: Record<string, number>) => Record<string, number>) => {
    setOverridesState((prev) => {
      const next = updater(prev);
      overridesRef.current = next;
      return next;
    });
  }, []);

  const clearOverride = useCallback((key: string) => {
    setOverrides((prev) => {
      if (!(key in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [setOverrides]);

  // --- Hidratacion desde localStorage (una vez por pedido) ----------------
  useEffect(() => {
    if (typeof window === 'undefined' || hydratedRef.current) {
      return;
    }
    hydratedRef.current = true;

    let parsed: DraftPayload | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      parsed = raw ? (JSON.parse(raw) as DraftPayload) : null;
    } catch {
      parsed = null;
    }

    const nextLedger: Record<number, StoreQty[]> = {};
    for (const [k, v] of Object.entries(parsed?.ledger || {})) {
      if (Array.isArray(v)) {
        nextLedger[Number(k)] = v.map((r) => ({ storeId: Number(r.storeId), quantity: Math.max(0, Number(r.quantity) || 0) }));
      }
    }
    ledgerRef.current = nextLedger;
    setLedgerState(nextLedger);

    const nextActivity = Array.isArray(parsed?.activity) ? parsed!.activity! : [];
    activityRef.current = nextActivity;
    setActivity(nextActivity);
  }, [storageKey]);

  const logActivity = useCallback((text: string) => {
    const entry: ActivityEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: nowIso(),
      user: currentUserName,
      text,
    };
    const next = [entry, ...activityRef.current].slice(0, 50);
    activityRef.current = next;
    setActivity(next);
    persist();
  }, [currentUserName, persist]);

  // --- Derivados ----------------------------------------------------------
  // Orden FIJO por id: las filas nunca cambian de posicion al reservar/liberar
  // con + / - (el orden no depende del estado reservado de cada linea).
  const activeItems = useMemo(
    () => order.items.filter((item) => !item.removed).sort((a, b) => a.id - b.id),
    [order.items],
  );

  // Productos eliminados (soft-delete persistido en backend, viene aparte del
  // detalle para no contaminar items/totales/picking).
  const removedItems = useMemo(
    () => [...(order.removedItems || [])].sort((a, b) => a.id - b.id),
    [order.removedItems],
  );

  // Sugerencias efectivas del item (unidas entre lineas de la misma variante).
  const suggestionsOf = useCallback(
    (item: AdminOrderItem): AdminOrderItemReservationSuggestion[] => mergedSuggestions(item, order.items),
    [order.items],
  );

  const committedRows = useCallback(
    (item: AdminOrderItem): StoreQty[] => committedRowsFrom(item, ledger, suggestionsOf(item)),
    [ledger, suggestionsOf],
  );

  const committedQty = useCallback(
    (item: AdminOrderItem, storeId: number): number => (
      committedRows(item).find((r) => r.storeId === storeId)?.quantity ?? 0
    ),
    [committedRows],
  );

  const getTarget = useCallback(
    (item: AdminOrderItem, storeId: number): number => {
      const key = keyOf(item.id, storeId);
      return key in overrides ? overrides[key] : committedQty(item, storeId);
    },
    [overrides, committedQty],
  );

  // Tiendas mostradas por linea = comprometidas + agregadas (split / seleccion).
  const displayStores = useCallback((item: AdminOrderItem): number[] => {
    const set = new Set<number>(committedRows(item).map((r) => r.storeId));
    for (const id of extraStores[item.id] || []) {
      set.add(id);
    }
    const ordered = suggestionsOf(item).map((s) => s.storeId).filter((id) => set.has(id));
    for (const id of set) {
      if (!ordered.includes(id)) {
        ordered.push(id);
      }
    }
    return ordered;
  }, [committedRows, extraStores, suggestionsOf]);

  // Auto-selecciona la tienda recomendada (mayor disponibilidad) la PRIMERA vez
  // que una linea aparece sin reserva ni tienda elegida: el operador ve el
  // stepper directo y reserva con un toque, sin abrir el desplegable. Una sola
  // vez por linea (ref) para no pelear con el usuario si luego la quita.
  const seededRecStoreRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!canEdit) {
      return;
    }
    setExtraStores((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of activeItems) {
        if (seededRecStoreRef.current.has(item.id)) {
          continue;
        }
        seededRecStoreRef.current.add(item.id);
        const hasCommitted = committedRows(item).length > 0;
        const hasExtra = (prev[item.id] || []).length > 0;
        const recommended = suggestionsOf(item)[0]?.storeId || 0;
        if (!hasCommitted && !hasExtra && recommended > 0) {
          next[item.id] = [recommended];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeItems, canEdit, committedRows, suggestionsOf, setExtraStores]);

  const lineTargetSum = useCallback(
    (item: AdminOrderItem): number => displayStores(item).reduce((sum, id) => sum + getTarget(item, id), 0),
    [displayStores, getTarget],
  );

  // Maximo reservable en una tienda: solicitado - reservado en otras tiendas de
  // la linea, acotado por el stock fisico (disponible + lo ya comprometido aqui,
  // que puede liberarse).
  const rowMax = useCallback((item: AdminOrderItem, storeId: number): number => {
    const requested = getRequested(item);
    const others = displayStores(item).reduce((sum, id) => (id === storeId ? sum : sum + getTarget(item, id)), 0);
    const capacity = getStoreAvailable(suggestionsOf(item), storeId) + committedQty(item, storeId);
    return Math.max(0, Math.min(requested - others, capacity));
  }, [displayStores, getTarget, committedQty, suggestionsOf]);

  // Disponible mostrado = stock libre real de la tienda (`availableStock`), la
  // misma verdad que la pantalla de inventario. Para "producto unico" (colores y
  // tallas son solo una guia de display: varias filas = misma variante y mismo
  // stock) el valor es identico entre filas hermanas y baja/sube parejo cuando se
  // reserva/libera en cualquiera de ellas.
  //
  // `availableStock` ya descuenta lo reservado (comprometido). Para que TODAS las
  // filas reflejen en vivo el +/- optimista antes de sincronizar, se descuenta el
  // delta pendiente (objetivo - comprometido) de todas las lineas de la variante.
  const displayAvailable = useCallback(
    (item: AdminOrderItem, storeId: number): number => {
      const base = getStoreAvailable(suggestionsOf(item), storeId);
      const pendingDelta = activeItems
        .filter((other) => Number(other.variantId) === Number(item.variantId))
        .reduce((sum, other) => sum + (getTarget(other, storeId) - committedQty(other, storeId)), 0);
      return Math.max(0, base - pendingDelta);
    },
    [activeItems, getTarget, committedQty, suggestionsOf],
  );

  const toLineInput = useCallback(
    (item: AdminOrderItem): LineInput => ({
      requested: getRequested(item),
      reserved: 0,
      shortage: 0,
      suggestions: suggestionsOf(item),
      assignments: displayStores(item).map((storeId) => ({ storeId, quantity: getTarget(item, storeId) })),
    }),
    [displayStores, getTarget, suggestionsOf],
  );

  const getLineState = useCallback(
    (item: AdminOrderItem): LineState => getLineStateLogic(toLineInput(item)),
    [toLineInput],
  );

  const stats = useMemo(() => ({
    ...computeStats(activeItems.map(toLineInput)),
    removedLines: removedItems.length,
  }), [activeItems, toLineInput, removedItems]);

  const headerState = useMemo<{ label: string; tone: string }>(() => {
    const map: Record<string, { label: string; tone: string }> = {
      vacio: { label: 'Sin productos', tone: 'gray' },
      listo_picking: { label: 'Listo para Picking', tone: 'green' },
      reservado_parcial: { label: 'Reservado parcialmente', tone: 'amber' },
      configurando: { label: 'Configurando', tone: 'blue' },
      pendiente: { label: 'Pendiente', tone: 'gray' },
    };
    return map[getHeaderState(stats)] || map.pendiente;
  }, [stats]);

  // --- Sincronizacion con el backend (reserva en vivo) --------------------
  const updateLedgerStore = useCallback((item: AdminOrderItem, storeId: number, qty: number) => {
    const suggestions = suggestionsOf(item);
    setLedger((prev) => {
      const base = committedRowsFrom(item, prev, suggestions);
      const map = new Map<number, number>(base.map((r) => [r.storeId, r.quantity]));
      if (qty > 0) {
        map.set(storeId, qty);
      } else {
        map.delete(storeId);
      }
      const rows = [...map.entries()].map(([sId, q]) => ({ storeId: sId, quantity: q }));
      return { ...prev, [item.id]: rows };
    });
  }, [setLedger, suggestionsOf]);

  const syncStore = useCallback(async (item: AdminOrderItem, storeId: number) => {
    const key = keyOf(item.id, storeId);
    if (inFlightRef.current.has(key)) {
      dirtyRef.current.add(key);
      return;
    }
    const committed = committedRowsFrom(item, ledgerRef.current, suggestionsOf(item)).find((r) => r.storeId === storeId)?.quantity ?? 0;
    const target = key in overridesRef.current ? overridesRef.current[key] : committed;
    const delta = target - committed;
    if (delta === 0) {
      clearOverride(key);
      return;
    }

    inFlightRef.current.add(key);
    setSyncingLines((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
    showAlert(delta > 0 ? 'Actualizando reserva…' : 'Actualizando liberacion…', 'info');
    try {
      let ok = false;
      let errMsg = '';
      // reservedActual = lo efectivamente reservado (puede ser < delta si otro
      // usuario tomo stock entremedio: reserva parcial). partialMsg trae el aviso
      // del backend ("Se reservaron X de Y…").
      let reservedActual = delta;
      let partialMsg = '';
      if (delta > 0) {
        const res = await fetch(`/api/admin/orders/${order.id}/reserve-remote`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sourceStoreId: storeId, variantId: item.variantId, quantity: delta, orderItemId: item.id, allowPartial: true }),
        });
        const payload = await res.json().catch(() => null) as {
          error?: unknown; message?: unknown;
          data?: { reservedQuantity?: unknown; partial?: unknown; message?: unknown };
        } | null;
        ok = res.ok;
        if (!ok) {
          errMsg = String(payload?.error || payload?.message || 'No se pudo reservar el stock.');
        } else {
          const reserved = Number(payload?.data?.reservedQuantity);
          if (Number.isFinite(reserved) && reserved >= 0) {
            reservedActual = reserved;
          }
          if (payload?.data?.partial === true) {
            partialMsg = String(payload?.data?.message || '');
          }
        }
      } else {
        const res = await fetch(`/api/admin/orders/${order.id}/items/${item.id}/release-remote`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ quantity: -delta, sourceStoreId: storeId }),
        });
        const payload = await res.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
        ok = res.ok;
        if (!ok) {
          errMsg = String(payload?.error || payload?.message || 'No se pudo liberar la reserva.');
        }
      }

      if (ok) {
        // En reserva parcial el ledger refleja lo realmente reservado, no lo pedido.
        const appliedTarget = delta > 0 ? committed + reservedActual : target;
        updateLedgerStore(item, storeId, appliedTarget);
        clearOverride(key);
        const storeName = getStoreName(suggestionsOf(item), storeId, item);
        showAlert(
          delta > 0
            ? (partialMsg || `Reservadas ${reservedActual} unidad(es) en ${storeName}.`)
            : `Liberadas ${-delta} unidad(es) de ${storeName}.`,
          delta > 0 && partialMsg ? 'info' : 'success',
        );
        logActivity(
          delta > 0
            ? `${currentUserName} reservo ${reservedActual} und de ${item.variant.productName} en ${storeName}`
            : `${currentUserName} libero ${-delta} und de ${item.variant.productName} en ${storeName}`,
        );
        await onReload();
      } else {
        clearOverride(key);
        showAlert(errMsg, 'error');
      }
    } catch {
      clearOverride(key);
      showAlert('Error de red al actualizar la reserva.', 'error');
    } finally {
      inFlightRef.current.delete(key);
      setSyncingLines((prev) => prev.filter((id) => id !== item.id || inFlightHasLine(item.id)));
      if (dirtyRef.current.has(key)) {
        dirtyRef.current.delete(key);
        scheduleSyncRef.current?.(item, storeId);
      }
    }
  }, [order.id, clearOverride, updateLedgerStore, showAlert, logActivity, currentUserName, onReload, suggestionsOf]);

  // ¿Queda alguna tienda de esta linea en vuelo? (para el indicador "guardando").
  function inFlightHasLine(itemId: number): boolean {
    for (const key of inFlightRef.current) {
      if (key.startsWith(`${itemId}:`)) {
        return true;
      }
    }
    return false;
  }

  const scheduleSyncRef = useRef<((item: AdminOrderItem, storeId: number) => void) | null>(null);
  const scheduleSync = useCallback((item: AdminOrderItem, storeId: number) => {
    const key = keyOf(item.id, storeId);
    const existing = debounceRef.current.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      debounceRef.current.delete(key);
      void syncStore(item, storeId);
    }, SYNC_DEBOUNCE_MS);
    debounceRef.current.set(key, timer);
  }, [syncStore]);

  useEffect(() => {
    scheduleSyncRef.current = scheduleSync;
  }, [scheduleSync]);

  // Limpia timers al desmontar.
  useEffect(() => () => {
    for (const timer of debounceRef.current.values()) {
      clearTimeout(timer);
    }
    for (const timer of undoTimersRef.current.values()) {
      clearTimeout(timer);
    }
  }, []);

  // --- Mutaciones de UI --------------------------------------------------
  function changeQuantity(item: AdminOrderItem, storeId: number, delta: number) {
    if (!canEdit) {
      showAlert('No tienes permiso para modificar reservas.', 'error');
      return;
    }
    const current = getTarget(item, storeId);
    const next = nextStepValue(current, delta, rowMax(item, storeId));
    if (next === current) {
      return;
    }
    setOverrides((prev) => ({ ...prev, [keyOf(item.id, storeId)]: next }));
    scheduleSync(item, storeId);
  }

  // Fija la cantidad a reservar de forma ABSOLUTA (input numerico directo), sin
  // tener que pulsar + N veces. Se acota a [0, max] y se reserva el delta.
  function setQuantity(item: AdminOrderItem, storeId: number, value: number) {
    if (!canEdit) {
      showAlert('No tienes permiso para modificar reservas.', 'error');
      return;
    }
    const max = rowMax(item, storeId);
    const clamped = Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
    const current = getTarget(item, storeId);
    if (clamped === current) {
      return;
    }
    setOverrides((prev) => ({ ...prev, [keyOf(item.id, storeId)]: clamped }));
    scheduleSync(item, storeId);
  }

  function selectStore(item: AdminOrderItem, storeId: number) {
    if (storeId <= 0) {
      return;
    }
    setExtraStores((prev) => {
      const arr = prev[item.id] || [];
      if (arr.includes(storeId)) {
        return prev;
      }
      return { ...prev, [item.id]: [...arr, storeId] };
    });
  }

  function changeRowStore(item: AdminOrderItem, oldStoreId: number, newStoreId: number) {
    if (committedQty(item, oldStoreId) > 0) {
      showAlert('Baja la cantidad a 0 antes de cambiar de tienda.', 'info');
      return;
    }
    const oldKey = keyOf(item.id, oldStoreId);
    const timer = debounceRef.current.get(oldKey);
    if (timer) {
      clearTimeout(timer);
      debounceRef.current.delete(oldKey);
    }
    clearOverride(oldKey);
    setExtraStores((prev) => {
      const arr = (prev[item.id] || []).filter((id) => id !== oldStoreId);
      if (!arr.includes(newStoreId)) {
        arr.push(newStoreId);
      }
      return { ...prev, [item.id]: arr };
    });
  }

  function removeRow(item: AdminOrderItem, storeId: number) {
    if (committedQty(item, storeId) > 0) {
      showAlert('Baja la cantidad a 0 para liberar esta tienda.', 'info');
      return;
    }
    clearOverride(keyOf(item.id, storeId));
    setExtraStores((prev) => ({ ...prev, [item.id]: (prev[item.id] || []).filter((id) => id !== storeId) }));
  }

  function addStoreSplit(item: AdminOrderItem) {
    const candidate = findSplitCandidate(toLineInput(item));
    if (!candidate) {
      const remaining = getRequested(item) - lineTargetSum(item);
      showAlert(
        remaining <= 0
          ? 'La cantidad solicitada ya esta totalmente reservada.'
          : 'No hay otra tienda con stock disponible para dividir.',
        'warning',
      );
      return;
    }
    selectStore(item, candidate.storeId);
    setOpenRowMenuId(null);
  }

  // Libera toda la reserva de una linea, con ventana de DESHACER en vez de un
  // dialogo previo: la accion se AGENDA 5s y el toast ofrece "Deshacer". Si no se
  // deshace, se ejecuta; si se deshace, no viaja nada al backend (cero riesgo).
  function releaseLine(item: AdminOrderItem) {
    setOpenRowMenuId(null);
    if (getReserved(item) <= 0) {
      // Nada reservado: solo limpiar tiendas/valores optimistas.
      setExtraStores((prev) => ({ ...prev, [item.id]: [] }));
      showAlert('Esta linea no tiene reservas por liberar.', 'info');
      return;
    }
    if (!canEdit) {
      showAlert('No tienes permiso para liberar reservas.', 'error');
      return;
    }
    if (releasingItemId !== null || undoTimersRef.current.has(item.id)) {
      return;
    }

    const timer = setTimeout(() => {
      undoTimersRef.current.delete(item.id);
      void performReleaseLine(item);
    }, 5000);
    undoTimersRef.current.set(item.id, timer);

    showAlert(`Liberando la reserva de ${item.variant.productName}…`, 'info', 5000, {
      label: 'Deshacer',
      onClick: () => {
        const pending = undoTimersRef.current.get(item.id);
        if (pending) {
          clearTimeout(pending);
          undoTimersRef.current.delete(item.id);
        }
        showAlert('Liberacion cancelada.', 'info');
      },
    });
  }

  async function performReleaseLine(item: AdminOrderItem) {
    setReleasingItemId(item.id);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/items/${item.id}/release-remote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
      if (!response.ok) {
        showAlert(String(payload?.error || payload?.message || 'No se pudo liberar la reserva.'), 'error');
        return;
      }
      showAlert('Reserva liberada. La linea vuelve a ser editable.', 'success');
      logActivity(`${currentUserName} libero la reserva de ${item.variant.productName}`);
      setLedger((prev) => ({ ...prev, [item.id]: [] }));
      setExtraStores((prev) => ({ ...prev, [item.id]: [] }));
      await onReload();
    } catch {
      showAlert('No se pudo liberar la reserva.', 'error');
    } finally {
      setReleasingItemId(null);
    }
  }

  // --- Eliminar / restaurar (soft-delete persistido en backend) ----------
  function openDeleteModal(itemId: number) {
    setDeleteReason(REMOVE_REASONS[0]);
    setDeleteNote('');
    setDeleteModalItemId(itemId);
    setOpenRowMenuId(null);
  }

  async function confirmDelete() {
    if (deleteModalItemId === null || removingItemId !== null) {
      return;
    }
    const itemId = deleteModalItemId;
    const item = order.items.find((it) => it.id === itemId);

    setRemovingItemId(itemId);
    try {
      // El backend marca el item como eliminado, libera su reserva y recalcula
      // el total (los eliminados quedan fuera de la ecuacion).
      const response = await fetch(`/api/admin/orders/${order.id}/items/${itemId}/remove`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: deleteReason, note: deleteNote.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo eliminar el producto.'), 'error');
        return;
      }
      // Limpiar el espejo local de reserva de esa linea.
      setLedger((prev) => ({ ...prev, [itemId]: [] }));
      setExtraStores((prev) => ({ ...prev, [itemId]: [] }));
      logActivity(`${currentUserName} elimino ${item?.variant.productName || 'un producto'} (${deleteReason})`);
      setDeleteModalItemId(null);
      await onReload();
    } catch {
      showAlert('No se pudo eliminar el producto.', 'error');
    } finally {
      setRemovingItemId(null);
    }
  }

  async function restoreItem(itemId: number) {
    if (restoringItemId !== null) {
      return;
    }
    const item = order.items.find((it) => it.id === itemId);

    setRestoringItemId(itemId);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/items/${itemId}/restore`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo restaurar el producto.'), 'error');
        return;
      }
      logActivity(`${currentUserName} restauro ${item?.variant.productName || 'un producto'}`);
      await onReload();
    } catch {
      showAlert('No se pudo restaurar el producto.', 'error');
    } finally {
      setRestoringItemId(null);
    }
  }

  // --- Agregar producto --------------------------------------------------
  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const response = await fetch('/api/admin/products?skip=1&take=300&isActive=true', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo cargar el catalogo.'), 'error');
        setAddCatalog([]);
        return;
      }
      setAddCatalog(normalizeCatalog(payload));
    } catch {
      showAlert('No se pudo cargar el catalogo.', 'error');
      setAddCatalog([]);
    } finally {
      setLoadingCatalog(false);
    }
  }, [showAlert]);

  function openAddModal() {
    if (!canEdit) {
      showAlert('No tienes permiso para editar esta proforma.', 'warning');
      return;
    }
    setAddSearch('');
    setAddProductId(null);
    setAddVariantId(null);
    setAddQty(1);
    setShowAddModal(true);
    if (addCatalog.length === 0 && !loadingCatalog) {
      void loadCatalog();
    }
  }

  // Paso 1: productos que coinciden con la busqueda (por nombre o SKU de variante).
  // Sin termino de busqueda NO se lista el catalogo completo: el operador escribe
  // y solo aparece el producto/variante buscado (evita el volcado de toda la lista).
  const addSearchProducts = useMemo(() => {
    const term = addSearch.trim().toLowerCase();
    if (!term) {
      return [];
    }
    const matches = addCatalog.filter((product) =>
      product.name.toLowerCase().includes(term)
      || product.variants.some((variant) => variant.sku.toLowerCase().includes(term)));
    return matches.slice(0, 50);
  }, [addCatalog, addSearch]);

  // Paso 2: variantes del producto elegido (se muestran como chips color/talla).
  const selectedProduct = useMemo(
    () => addCatalog.find((product) => product.id === addProductId) || null,
    [addCatalog, addProductId],
  );

  function selectAddProduct(product: CatalogProduct) {
    setAddProductId(product.id);
    // Auto-selecciona si solo hay una variante; si no, obliga a elegir color/talla.
    setAddVariantId(product.variants.length === 1 ? product.variants[0].id : null);
  }

  async function submitAddProduct() {
    if (!canEdit || addingProduct) {
      return;
    }
    if (!addVariantId || addQty < 1) {
      showAlert('Selecciona un producto y una cantidad valida.', 'warning');
      return;
    }

    const selected = selectedProduct?.variants.find((variant) => variant.id === addVariantId);
    if (!selected) {
      showAlert('Selecciona un producto y una cantidad valida.', 'warning');
      return;
    }
    // Variante virtual marketplace: al backend va la variante fisica real
    // (sourceVariantId) + color/talla como guide; la fila mostrara ese color/talla.
    const body = selected.isVirtual
      ? {
        variantId: selected.sourceVariantId ?? selected.id,
        quantity: addQty,
        colorName: selected.colorName,
        sizeName: selected.sizeName,
        displayVariantId: selected.id,
      }
      : { variantId: selected.id, quantity: addQty };

    setAddingProduct(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown; message?: unknown } | null)?.error
          || (payload as { error?: unknown; message?: unknown } | null)?.message
          || 'No se pudo agregar el producto.'), 'error');
        return;
      }
      showAlert('Producto agregado a la proforma.', 'success');
      logActivity(`${currentUserName} agrego un producto a la proforma`);
      setShowAddModal(false);
      await onReload();
    } catch {
      showAlert('No se pudo agregar el producto.', 'error');
    } finally {
      setAddingProduct(false);
    }
  }

  // Reserva de una vez todo lo pendiente con la tienda recomendada (1 request
  // atomico backend). Evita configurar tienda + stepper linea por linea.
  async function reserveAllRecommended() {
    if (!canEdit) {
      showAlert('No tienes permiso para reservar stock.', 'error');
      return;
    }
    if (reservingAll) {
      return;
    }
    setReservingAll(true);
    showAlert('Reservando con la tienda recomendada…', 'info');
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/reserve-all-recommended`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => null) as { data?: { message?: unknown; reservedUnits?: unknown }; error?: unknown; message?: unknown } | null;
      if (!response.ok) {
        showAlert(String(payload?.error || payload?.message || 'No se pudo reservar el stock.'), 'error');
        return;
      }
      const reservedUnits = Number(payload?.data?.reservedUnits || 0);
      showAlert(
        reservedUnits > 0 ? String(payload?.data?.message || `Reservadas ${reservedUnits} unidad(es).`) : 'No habia stock disponible para reservar.',
        reservedUnits > 0 ? 'success' : 'warning',
      );
      logActivity(`${currentUserName} reservo ${reservedUnits} und con la tienda recomendada`);
      await onReload();
    } catch {
      showAlert('Error de red al reservar el stock.', 'error');
    } finally {
      setReservingAll(false);
    }
  }

  function saveDraft() {
    setSavingDraft(true);
    try {
      persist();
      showAlert('Borrador guardado en este equipo.', 'success');
    } finally {
      setSavingDraft(false);
    }
  }

  function exportCsv() {
    if (typeof window === 'undefined') {
      return;
    }
    const rows = [['Producto', 'SKU', 'Color', 'Talla', 'Solicitado', 'Reservado', 'Estado']];
    for (const item of activeItems) {
      rows.push([
        item.variant.productName,
        item.variant.sku,
        item.variant.colorName,
        item.variant.sizeName,
        String(getRequested(item)),
        String(Math.min(getRequested(item), lineTargetSum(item))),
        STATE_META[getLineState(item)].label,
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${order.code}-reservas.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const removedList = useMemo(
    () => removedItems.map((item) => ({ item, id: item.id })),
    [removedItems],
  );

  // -----------------------------------------------------------------------
  return (
    <section className="ff-panel">
      <div className="ff-main admin-card">
        {/* Header */}
        <header className="ff-header">
          <div className="ff-header-title">
            <div className="ff-header-row">
              <h2>Preparacion del pedido</h2>
              <span className={`ff-badge ff-badge-${headerState.tone}`}>{headerState.label}</span>
            </div>
            <strong className="ff-code">{order.code}</strong>
            <span className="ff-muted">Ajusta la cantidad con + / - y se reserva en vivo por tienda</span>
          </div>
          <Link href="/admin/orders/picking" className="ff-ghost-btn">
            Ver tablero de picking
          </Link>
        </header>

        {/* Resumen superior */}
        <div className="ff-stats">
          <StatCard tone="indigo" label="Total productos" value={stats.totalLines} unit="lineas" icon="box" />
          <StatCard tone="green" label="Reservados" value={stats.reservedLines} unit="lineas" icon="lock" />
          {stats.configured > 0 ? (
            <StatCard tone="amber" label="Parciales" value={stats.configured} unit="lineas" icon="clock" />
          ) : null}
          {stats.pendingLines > 0 ? (
            <StatCard tone="blue" label="Pendientes" value={stats.pendingLines} unit="linea(s)" icon="check" />
          ) : null}
          {stats.removedLines > 0 ? (
            <StatCard
              tone="red"
              label="Eliminados"
              value={stats.removedLines}
              unit="lineas"
              icon="x"
              action={{ label: 'Ver', onClick: () => setShowRemovedPanel(true) }}
            />
          ) : null}
        </div>

        {/* Tabla */}
        <div className="ff-table-block">
          <div className="ff-table-head">
            <h3>Productos del pedido</h3>
            <div className="ff-table-actions">
              {canEdit ? (
                <button
                  type="button"
                  className="ff-primary-btn ff-sm"
                  disabled={reservingAll || stats.totalPending <= 0}
                  onClick={reserveAllRecommended}
                >
                  {reservingAll ? 'Reservando…' : 'Reservar todo (recomendada)'}
                </button>
              ) : null}
              <button type="button" className="ff-ghost-btn ff-sm" onClick={() => setShowRemovedPanel((v) => !v)}>
                Ver eliminados ({stats.removedLines})
              </button>
              <button type="button" className="ff-ghost-btn ff-sm" onClick={exportCsv}>Exportar</button>
            </div>
          </div>

          {activeItems.length === 0 ? (
            <p className="ff-muted ff-empty">No hay productos activos en el pedido.</p>
          ) : (
            <>
            <div className="ff-table-wrap ff-desktop-only">
              <table className="ff-table">
                <thead>
                  <tr>
                    <th className="ff-col-prod">Producto</th>
                    <th>Color</th>
                    <th>Talla</th>
                    <th className="ff-num">Solicitado</th>
                    <th>Tienda (origen)</th>
                    <th className="ff-num">Disponible</th>
                    <th className="ff-center">Cantidad a reservar</th>
                    <th className="ff-center">Reservado</th>
                    <th>Estado</th>
                    <th className="ff-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {activeItems.map((item) => {
                    const requested = getRequested(item);
                    const rows = displayStores(item);
                    const targetSum = lineTargetSum(item);
                    const assigned = Math.min(requested, targetSum);
                    const state = getLineState(item);
                    const suggestions = suggestionsOf(item);
                    const usedStores = new Set(rows);
                    const availableSuggestions = suggestions.filter((s) => !usedStores.has(s.storeId));
                    const initial = item.variant.productName.trim().charAt(0).toUpperCase() || '?';
                    const remaining = requested - targetSum;
                    const isSyncing = syncingLines.includes(item.id);
                    const canSplit = remaining > 0 && findSplitCandidate(toLineInput(item)) !== null;
                    return (
                      <tr key={`ff-row-${item.id}`}>
                        <td className="ff-col-prod">
                          <div className="ff-product">
                            <span className="ff-thumb" aria-hidden>{initial}</span>
                            <div className="ff-product-info">
                              <span className="ff-product-name">{item.variant.productName}</span>
                              <span className="ff-sku">SKU: {item.variant.sku}</span>
                            </div>
                          </div>
                        </td>
                        <td data-label="Color">{item.variant.colorName}</td>
                        <td data-label="Talla">{item.variant.sizeName}</td>
                        <td className="ff-num" data-label="Solicitado">{requested}</td>

                        {/* Tienda(s) origen */}
                        <td className="ff-store-col" data-label="Tienda (origen)">
                          {rows.length === 0 ? (
                            <div className="ff-store-cell">
                              <select
                                className="ff-select is-empty"
                                value={0}
                                disabled={!canEdit || suggestions.length === 0}
                                onChange={(e) => selectStore(item, Number(e.target.value))}
                              >
                                <option value={0}>Seleccionar tienda</option>
                                {suggestions.map((s) => (
                                  <option key={`opt-${item.id}-${s.storeId}`} value={s.storeId}>
                                    {s.storeName} ({s.availableStock})
                                  </option>
                                ))}
                              </select>
                              <span className="ff-store-warn">
                                {suggestions.length === 0 ? 'Sin stock en tiendas' : 'Elige una tienda y usa +'}
                              </span>
                            </div>
                          ) : null}

                          {rows.map((storeId) => {
                            const committed = committedQty(item, storeId);
                            const isRecommended = suggestions[0]?.storeId === storeId;
                            const available = displayAvailable(item, storeId);
                            return (
                              <div key={`store-${item.id}-${storeId}`} className="ff-store-cell">
                                <div className="ff-store-row">
                                  {committed > 0 ? (
                                    <span className="ff-reserved-badge">✓ {getStoreName(suggestions, storeId, item)}</span>
                                  ) : (
                                    <select
                                      className="ff-select"
                                      value={storeId}
                                      disabled={!canEdit}
                                      onChange={(e) => changeRowStore(item, storeId, Number(e.target.value))}
                                    >
                                      <option value={storeId}>{getStoreName(suggestions, storeId, item)}</option>
                                      {availableSuggestions.map((s) => (
                                        <option key={`opt-${item.id}-${storeId}-${s.storeId}`} value={s.storeId}>
                                          {s.storeName} ({s.availableStock})
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  {rows.length > 1 && committed <= 0 ? (
                                    <button
                                      type="button"
                                      className="ff-split-remove"
                                      aria-label="Quitar tienda"
                                      onClick={() => removeRow(item, storeId)}
                                    >×</button>
                                  ) : null}
                                </div>
                                {isRecommended ? <span className="ff-store-tag is-rec">★ Recomendada</span> : <span className="ff-store-tag">Otra opcion</span>}
                                <span className="ff-store-avail">Disponible: {available}</span>
                              </div>
                            );
                          })}

                          {canEdit && canSplit && rows.length > 0 ? (
                            <button type="button" className="ff-add-store-inline" onClick={() => addStoreSplit(item)}>
                              + Agregar otra tienda
                            </button>
                          ) : null}
                        </td>

                        {/* Disponible (tienda principal) */}
                        <td data-label="Disponible" className={`ff-num ff-avail is-${rows[0] ? toneFor(displayAvailable(item, rows[0]), remaining) : (suggestions[0] ? toneFor(suggestions[0].availableStock, requested) : 'red')}`}>
                          {rows[0] ? displayAvailable(item, rows[0]) : (suggestions[0]?.availableStock ?? 0)}
                        </td>

                        {/* Cantidad a reservar (stepper por tienda) */}
                        <td className="ff-center ff-qty-col" data-label="Cantidad a reservar">
                          {rows.length === 0 ? <span className="ff-qty-none">—</span> : null}
                          {rows.map((storeId) => {
                            const qty = getTarget(item, storeId);
                            const max = rowMax(item, storeId);
                            return (
                              <div key={`qty-${item.id}-${storeId}`} className="ff-qty">
                                <div className={`ff-stepper ${!canEdit ? 'is-disabled' : ''} ${isSyncing ? 'is-syncing' : ''}`}>
                                  <button
                                    type="button"
                                    aria-label="Disminuir"
                                    disabled={!canEdit || isSyncing || qty <= 0}
                                    onClick={() => changeQuantity(item, storeId, -1)}
                                  >–</button>
                                  <input
                                    className="ff-stepper-input"
                                    type="text"
                                    inputMode="numeric"
                                    aria-label="Cantidad a reservar"
                                    value={qty}
                                    disabled={!canEdit || isSyncing}
                                    onChange={(e) => setQuantity(item, storeId, Number(e.target.value.replace(/\D/g, '')) || 0)}
                                  />
                                  <button
                                    type="button"
                                    aria-label="Aumentar"
                                    disabled={!canEdit || isSyncing || qty >= max}
                                    onClick={() => changeQuantity(item, storeId, 1)}
                                  >+</button>
                                </div>
                                {isSyncing ? (
                                  <span className="ff-qty-sync"><span className="ff-spinner ff-spinner-sm" aria-hidden />Guardando…</span>
                                ) : (
                                  <span className="ff-qty-max">Max: {max}</span>
                                )}
                              </div>
                            );
                          })}
                        </td>

                        {/* Reservado */}
                        <td data-label="Reservado" className={`ff-center ff-assigned is-${state}`}>
                          {assigned} / {requested}
                          {isSyncing ? <span className="ff-sync-hint"> · guardando…</span> : null}
                        </td>

                        {/* Estado */}
                        <td data-label="Estado">
                          <span className={`ff-state ff-state-${STATE_META[state].tone}`}>{STATE_META[state].label}</span>
                        </td>

                        {/* Acciones */}
                        <td className="ff-center ff-actions-col" data-label="Acciones">
                          <div className="ff-row-menu-wrap">
                            <button
                              type="button"
                              className="ff-icon-btn"
                              aria-label="Acciones"
                              onClick={() => setOpenRowMenuId((cur) => (cur === item.id ? null : item.id))}
                            >⋮</button>
                            {openRowMenuId === item.id ? (
                              <div className="ff-row-menu">
                                {canSplit ? (
                                  <button type="button" onClick={() => addStoreSplit(item)}>
                                    Agregar otra tienda
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => void releaseLine(item)}
                                  disabled={!canEdit || releasingItemId === item.id || getReserved(item) <= 0}
                                >
                                  {releasingItemId === item.id ? 'Liberando...' : 'Liberar reserva'}
                                </button>
                                <button type="button" className="ff-danger" onClick={() => openDeleteModal(item.id)} disabled={!canEdit}>
                                  Eliminar del pedido
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Vista compacta movil: una tarjeta por variante (misma logica que la tabla) */}
            <div className="ff-mobile-cards">
              {activeItems.map((item) => {
                const requested = getRequested(item);
                const rows = displayStores(item);
                const targetSum = lineTargetSum(item);
                const assigned = Math.min(requested, targetSum);
                const state = getLineState(item);
                const suggestions = suggestionsOf(item);
                const usedStores = new Set(rows);
                const availableSuggestions = suggestions.filter((s) => !usedStores.has(s.storeId));
                const remaining = requested - targetSum;
                const isSyncing = syncingLines.includes(item.id);
                const canSplit = remaining > 0 && findSplitCandidate(toLineInput(item)) !== null;
                const initial = item.variant.productName.trim().charAt(0).toUpperCase() || '?';
                const recAvailable = rows[0] ? displayAvailable(item, rows[0]) : (suggestions[0]?.availableStock ?? 0);
                return (
                  <article key={`ff-m-${item.id}`} className={`ff-mcard is-${state}`}>
                    <div className="ff-mcard-head">
                      <span className="ff-thumb" aria-hidden>{initial}</span>
                      <div className="ff-mcard-title">
                        <span className="ff-product-name">{item.variant.productName}</span>
                        <span className="ff-mcard-variant">{item.variant.colorName} · {item.variant.sizeName}</span>
                      </div>
                      <span className={`ff-state ff-state-${STATE_META[state].tone}`}>{STATE_META[state].label}</span>
                      <div className="ff-row-menu-wrap">
                        <button
                          type="button"
                          className="ff-icon-btn"
                          aria-label="Acciones"
                          onClick={() => setOpenRowMenuId((cur) => (cur === item.id ? null : item.id))}
                        >⋮</button>
                        {openRowMenuId === item.id ? (
                          <div className="ff-row-menu">
                            {canSplit ? (
                              <button type="button" onClick={() => addStoreSplit(item)}>Agregar otra tienda</button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void releaseLine(item)}
                              disabled={!canEdit || releasingItemId === item.id || getReserved(item) <= 0}
                            >
                              {releasingItemId === item.id ? 'Liberando...' : 'Liberar reserva'}
                            </button>
                            <button type="button" className="ff-danger" onClick={() => openDeleteModal(item.id)} disabled={!canEdit}>
                              Eliminar del pedido
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="ff-mcard-metrics">
                      <span className="ff-metric"><b>{requested}</b><small>Solic</small></span>
                      <span className={`ff-metric is-assigned-${STATE_META[state].tone}`}><b>{assigned}</b><small>Reserv</small></span>
                      <span className={`ff-metric is-${toneFor(recAvailable, remaining)}`}><b>{recAvailable}</b><small>Disp</small></span>
                    </div>

                    {rows.length === 0 ? (
                      <div className="ff-mcard-store-empty">
                        <select
                          className="ff-select is-empty"
                          value={0}
                          disabled={!canEdit || suggestions.length === 0}
                          onChange={(e) => selectStore(item, Number(e.target.value))}
                        >
                          <option value={0}>Seleccionar tienda</option>
                          {suggestions.map((s) => (
                            <option key={`m-opt-${item.id}-${s.storeId}`} value={s.storeId}>
                              {s.storeName} ({s.availableStock})
                            </option>
                          ))}
                        </select>
                        <span className="ff-store-warn">
                          {suggestions.length === 0 ? 'Sin stock en tiendas' : 'Elige una tienda y usa +'}
                        </span>
                      </div>
                    ) : rows.map((storeId) => {
                      const committed = committedQty(item, storeId);
                      const isRecommended = suggestions[0]?.storeId === storeId;
                      const available = displayAvailable(item, storeId);
                      const qty = getTarget(item, storeId);
                      const max = rowMax(item, storeId);
                      return (
                        <div key={`m-store-${item.id}-${storeId}`} className="ff-mcard-store">
                          <div className="ff-mcard-store-info">
                            {committed > 0 ? (
                              <span className="ff-reserved-badge">✓ {getStoreName(suggestions, storeId, item)}</span>
                            ) : (
                              <select
                                className="ff-select"
                                value={storeId}
                                disabled={!canEdit}
                                onChange={(e) => changeRowStore(item, storeId, Number(e.target.value))}
                              >
                                <option value={storeId}>{getStoreName(suggestions, storeId, item)}</option>
                                {availableSuggestions.map((s) => (
                                  <option key={`m-opt-${item.id}-${storeId}-${s.storeId}`} value={s.storeId}>
                                    {s.storeName} ({s.availableStock})
                                  </option>
                                ))}
                              </select>
                            )}
                            <span className="ff-store-avail">
                              {isRecommended ? '★ ' : ''}Disp: {available}
                            </span>
                          </div>
                          <div className={`ff-stepper ${!canEdit ? 'is-disabled' : ''} ${isSyncing ? 'is-syncing' : ''}`}>
                            <button
                              type="button"
                              aria-label="Disminuir"
                              disabled={!canEdit || isSyncing || qty <= 0}
                              onClick={() => changeQuantity(item, storeId, -1)}
                            >–</button>
                            <input
                              className="ff-stepper-input"
                              type="text"
                              inputMode="numeric"
                              aria-label="Cantidad a reservar"
                              value={qty}
                              disabled={!canEdit || isSyncing}
                              onChange={(e) => setQuantity(item, storeId, Number(e.target.value.replace(/\D/g, '')) || 0)}
                            />
                            <button
                              type="button"
                              aria-label="Aumentar"
                              disabled={!canEdit || isSyncing || qty >= max}
                              onClick={() => changeQuantity(item, storeId, 1)}
                            >+</button>
                          </div>
                        </div>
                      );
                    })}

                    {canEdit && canSplit && rows.length > 0 ? (
                      <button type="button" className="ff-add-store-inline" onClick={() => addStoreSplit(item)}>
                        + Agregar otra tienda
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
            </>
          )}

          {/* Leyenda */}
          <div className="ff-legend">
            <span><i className="ff-dot is-green" />Reservado (cubre lo solicitado)</span>
            <span><i className="ff-dot is-amber" />Parcial (reservado &lt; solicitado)</span>
            <span><i className="ff-dot is-gray" />Pendiente (sin reservar)</span>
            <span><i className="ff-dot is-red" />Sin stock</span>
          </div>
        </div>

        {/* Footer */}
        <footer className="ff-footer">
          <div className="ff-footer-summary">
            <div className="ff-footer-block">
              <strong>Resumen de reservas</strong>
              <span className="ff-muted">{stats.reservedLines} de {stats.totalLines} lineas reservadas</span>
            </div>
            <div className="ff-footer-metric">
              <span className="ff-muted">Unidades solicitadas</span>
              <strong>{stats.totalRequested} unidades</strong>
            </div>
            <div className="ff-footer-metric">
              <span className="ff-muted">Unidades reservadas</span>
              <strong className="is-green">{stats.totalAssigned} unidades</strong>
            </div>
            <div className="ff-footer-metric">
              <span className="ff-muted">Unidades pendientes</span>
              <strong className="is-red">{stats.totalPending} unidades</strong>
            </div>
          </div>
          <div className="ff-footer-actions">
            <button type="button" className="ff-ghost-btn" onClick={() => router.push('/admin/orders/list')}>
              Cancelar
            </button>
            <button type="button" className="ff-ghost-btn" disabled={savingDraft} onClick={saveDraft}>
              {savingDraft ? 'Guardando...' : 'Guardar borrador'}
            </button>
          </div>
        </footer>
      </div>

      {/* Sidebar */}
      <aside className="ff-sidebar">
        <div className="admin-card ff-side-card">
          <h3>Acciones rapidas</h3>
          <ul className="ff-quick-actions">
            {canEdit ? (
              <li><button type="button" onClick={openAddModal}>Agregar producto</button></li>
            ) : null}
            <li><button type="button" onClick={() => setShowRemovedPanel(true)}>Restaurar producto eliminado</button></li>
            <li>
              <button type="button" onClick={() => {
                const reservedLine = activeItems.find((it) => getReserved(it) > 0);
                if (reservedLine) { void releaseLine(reservedLine); return; }
                showAlert('No hay reservas por liberar.', 'info');
              }}>Liberar reservas</button>
            </li>
            <li><button type="button" onClick={() => window.print()}>Imprimir resumen</button></li>
          </ul>
        </div>

        {(showRemovedPanel || stats.removedLines > 0) ? (
          <div className="admin-card ff-side-card">
            <h3>Productos eliminados ({stats.removedLines})</h3>
            {removedList.length === 0 ? (
              <>
                <p className="ff-muted">No hay productos eliminados</p>
                <p className="ff-muted ff-tiny">Los productos eliminados apareceran aqui con su motivo y opcion de restaurar.</p>
              </>
            ) : (
              <ul className="ff-removed-list">
                {removedList.map(({ item, id }) => (
                  <li key={`removed-${id}`}>
                    <div className="ff-removed-head">
                      <strong>{item.variant.productName || 'Producto'}</strong>
                      <button
                        type="button"
                        className="ff-link-btn"
                        disabled={restoringItemId === id}
                        onClick={() => { void restoreItem(id); }}
                      >
                        {restoringItemId === id ? 'Restaurando...' : 'Restaurar'}
                      </button>
                    </div>
                    <span className="ff-muted ff-tiny">
                      {item.removedReason || 'Sin motivo'}
                      {item.removedAt ? ` · ${formatDateTime(item.removedAt)}` : ''}
                      {item.removedByName ? ` · ${item.removedByName}` : ''}
                    </span>
                    {item.removedNote ? <span className="ff-removed-note">{item.removedNote}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div className="admin-card ff-side-card">
          <h3>Actividad reciente</h3>
          {activity.length === 0 ? (
            <p className="ff-muted">Aun no hay actividad registrada.</p>
          ) : (
            <ul className="ff-activity">
              {activity.map((entry) => (
                <li key={entry.id}>
                  <span className="ff-activity-time">{formatTime(entry.at)}</span>
                  <span className="ff-activity-text">{entry.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="admin-card ff-side-card ff-tips">
          <h3>Consejos</h3>
          <ul>
            <li>Cada + o - reserva o libera en vivo en la tienda seleccionada.</li>
            <li>La tienda recomendada es la de mayor disponibilidad.</li>
            <li>Divide una linea entre tiendas con &quot;Agregar otra tienda&quot;.</li>
            <li>Baja la cantidad a 0 para liberar una tienda; elimina un producto solo si no se puede conseguir.</li>
          </ul>
        </div>
      </aside>

      {/* Modal agregar producto */}
      {showAddModal ? (
        <div className="ff-modal-overlay" onClick={() => (addingProduct ? null : setShowAddModal(false))}>
          <div className="ff-modal admin-card" onClick={(e) => e.stopPropagation()}>
            <h3>Agregar producto a la proforma</h3>
            <p className="ff-muted">
              El precio se toma de la variante y el total se recalcula segun la configuracion del sistema. Luego podras reservar su stock.
            </p>
            <label className="ff-field">
              <span>Buscar</span>
              <input
                className="ff-select"
                type="text"
                value={addSearch}
                placeholder="Nombre o SKU..."
                onChange={(e) => setAddSearch(e.target.value)}
              />
            </label>
            <div className="ff-add-results">
              {loadingCatalog ? (
                <p className="ff-muted">Cargando catalogo...</p>
              ) : addSearch.trim() === '' ? (
                <p className="ff-muted">Escribe un nombre o SKU para buscar el producto.</p>
              ) : addSearchProducts.length === 0 ? (
                <p className="ff-muted">Sin resultados para “{addSearch.trim()}”.</p>
              ) : (
                <ul>
                  {addSearchProducts.map((product) => (
                    <li key={`add-prod-${product.id}`}>
                      <button
                        type="button"
                        className={`ff-add-option${addProductId === product.id ? ' is-selected' : ''}`}
                        onClick={() => selectAddProduct(product)}
                      >
                        <span className="ff-add-option-name">{product.name}</span>
                        <span className="ff-muted ff-tiny">
                          {product.variants.length} variante{product.variants.length === 1 ? '' : 's'} · desde S/ {Math.min(...product.variants.map((v) => v.price)).toFixed(2)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedProduct ? (
              <div className="ff-field">
                <span>Variante ({selectedProduct.name})</span>
                <div className="ff-variant-chips">
                  {selectedProduct.variants.map((variant) => (
                    <button
                      key={`add-var-${variant.id}`}
                      type="button"
                      className={`ff-variant-chip${addVariantId === variant.id ? ' is-selected' : ''}`}
                      title={`${variant.colorName} · ${variant.sizeName} · S/ ${variant.price.toFixed(2)}`}
                      onClick={() => setAddVariantId(variant.id)}
                    >
                      <span
                        className="ff-swatch"
                        style={{ background: variant.colorHex || 'transparent' }}
                        aria-hidden="true"
                      />
                      <span className="ff-variant-chip-color">{variant.colorName}</span>
                      {variant.sizeName && variant.sizeName !== 'Sin talla' ? (
                        <span className="ff-variant-chip-size">{variant.sizeName}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="ff-field">
              <span>Cantidad</span>
              <div className="ff-stepper ff-stepper-lg">
                <button
                  type="button"
                  aria-label="Disminuir"
                  disabled={addingProduct || addQty <= 1}
                  onClick={() => setAddQty((q) => Math.max(1, q - 1))}
                >–</button>
                <span>{addQty}</span>
                <button
                  type="button"
                  aria-label="Aumentar"
                  disabled={addingProduct}
                  onClick={() => setAddQty((q) => q + 1)}
                >+</button>
              </div>
            </label>
            <div className="ff-modal-actions">
              <button type="button" className="ff-ghost-btn" disabled={addingProduct} onClick={() => setShowAddModal(false)}>Cancelar</button>
              <button
                type="button"
                className="ff-primary-btn"
                disabled={addingProduct || !addVariantId}
                onClick={submitAddProduct}
              >
                {addingProduct ? 'Agregando...' : 'Agregar producto'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal eliminar */}
      {deleteModalItemId !== null ? (
        <div className="ff-modal-overlay" onClick={() => (removingItemId !== null ? null : setDeleteModalItemId(null))}>
          <div className="ff-modal admin-card" onClick={(e) => e.stopPropagation()}>
            <h3>Eliminar producto del pedido</h3>
            <p className="ff-muted">
              {order.items.find((it) => it.id === deleteModalItemId)?.variant.productName}. El producto no se borra: queda como eliminado y podras restaurarlo.
            </p>
            <label className="ff-field">
              <span>Motivo</span>
              <select className="ff-select" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)}>
                {REMOVE_REASONS.map((reason) => (
                  <option key={`reason-${reason}`} value={reason}>{reason}</option>
                ))}
              </select>
            </label>
            <label className="ff-field">
              <span>Observaciones</span>
              <textarea
                className="ff-textarea"
                rows={3}
                value={deleteNote}
                placeholder="Detalle opcional..."
                onChange={(e) => setDeleteNote(e.target.value)}
              />
            </label>
            <div className="ff-modal-actions">
              <button type="button" className="ff-ghost-btn" disabled={removingItemId !== null} onClick={() => setDeleteModalItemId(null)}>Cancelar</button>
              <button type="button" className="ff-primary-btn ff-danger-btn" disabled={removingItemId !== null} onClick={confirmDelete}>
                {removingItemId !== null ? 'Eliminando...' : 'Confirmar eliminacion'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Barra inferior sticky (movil): progreso + accion primaria en zona del pulgar */}
      {canEdit && stats.totalPending > 0 ? (
        <div className="ff-sticky-bar">
          <div className="ff-sticky-info">
            <strong>{stats.totalAssigned}/{stats.totalRequested}</strong>
            <small>reservadas</small>
          </div>
          <button type="button" className="ff-primary-btn" disabled={reservingAll} onClick={reserveAllRecommended}>
            {reservingAll ? 'Reservando…' : 'Reservar todo'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function toneFor(available: number, needed: number): 'green' | 'amber' | 'red' {
  if (available <= 0) return 'red';
  if (needed > 0 && available < needed) return 'amber';
  return 'green';
}

interface StatCardProps {
  tone: string;
  label: string;
  value: number;
  unit: string;
  icon: string;
  action?: { label: string; onClick: () => void };
}

function StatCard({ tone, label, value, unit, icon, action }: StatCardProps) {
  const glyph: Record<string, string> = { box: '▦', check: '✓', lock: '🔒', clock: '◷', x: '✕' };
  return (
    <div className="ff-stat">
      <span className={`ff-stat-icon is-${tone}`} aria-hidden>{glyph[icon] || '•'}</span>
      <div className="ff-stat-body">
        <span className="ff-stat-label">{label}</span>
        <strong className="ff-stat-value">{value} <em>{unit}</em></strong>
      </div>
      {action ? (
        <button type="button" className="ff-ghost-btn ff-xs" onClick={action.onClick}>{action.label}</button>
      ) : null}
    </div>
  );
}
