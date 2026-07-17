// Formateo y parseo PURO de la nota/monetario de un pedido. Extraido de
// admin-order-detail-page.tsx para poder testearlo aislado (sin React).
// La `note` del pedido concatena segmentos separados por '|' (CHANNEL, DIRECCION,
// METODO_PAGO, Ref, montos, NOTA_CLIENTE, etc.); aqui se leen/limpian.

export function getChannelLabel(channel: string): string {
  const normalized = String(channel || '').toUpperCase();
  if (normalized === 'POS') return 'POS';
  if (normalized === 'ECOMMERCE') return 'Ecommerce';
  if (normalized === 'INTERNAL') return 'Interno';
  return 'No definido';
}

export function formatMoney(value: number): string {
  return `S/ ${Number(value || 0).toFixed(2)}`;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function formatDateTimeFromDate(value: Date | null): string {
  if (!value || Number.isNaN(value.getTime())) {
    return 'Sin fecha';
  }
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(value);
}

export function parsePaymentMethod(note: string): string {
  const match = String(note || '').match(/(?:Metodo de pago|METODO_PAGO)\s*:\s*([^|]+)/i);
  return match?.[1]?.trim() || 'No especificado';
}

export function parsePaymentReference(note: string): string {
  const match = String(note || '').match(/Ref:\s*([^|]+)/i);
  return match?.[1]?.trim() || '-';
}

export function parseClientAddress(note: string): string {
  const match = String(note || '').match(/(?:^|\|)\s*DIRECCION\s*:\s*([^|]+)/i);
  return match?.[1]?.trim() || '';
}

export function parsePaymentAmount(note: string, labels: string[]): number | null {
  const safeLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = String(note || '').match(new RegExp(`(?:${safeLabels})\\s*:\\s*S?\\/?\\s*([\\d.,]+)`, 'i'));
  if (!match?.[1]) return null;
  const normalized = match[1].replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function parsePaymentAmountLabel(note: string, labels: string[]): string {
  const value = parsePaymentAmount(note, labels);
  return value === null ? 'No disponible' : formatMoney(value);
}

export function getDisplayNote(note: string): string {
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
