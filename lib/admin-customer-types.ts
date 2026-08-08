export interface AdminCustomer {
  id: number;
  name: string;
  documentType: string;
  documentNumber: string;
  email: string;
  phone: string;
  address: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCustomersResponse {
  data: AdminCustomer[];
  total: number;
  page: number;
  limit: number;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeCustomer(value: unknown): AdminCustomer | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = Number(raw.id);
  const name = text(raw.name);
  if (!Number.isInteger(id) || id < 1 || !name) return null;
  return {
    id,
    name,
    documentType: text(raw.documentType),
    documentNumber: text(raw.documentNumber),
    email: text(raw.email),
    phone: text(raw.phone),
    address: text(raw.address),
    isActive: raw.isActive !== false,
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
  };
}

export function normalizeCustomersResponse(payload: unknown): AdminCustomersResponse {
  const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const data = Array.isArray(raw.data)
    ? raw.data.map(normalizeCustomer).filter((item): item is AdminCustomer => Boolean(item))
    : [];
  return {
    data,
    total: Math.max(0, Number(raw.total) || data.length),
    page: Math.max(1, Number(raw.page) || 1),
    limit: Math.max(1, Number(raw.limit) || 50),
  };
}

export function customerDocumentLabel(customer: Pick<AdminCustomer, 'documentType' | 'documentNumber'>): string {
  if (!customer.documentNumber) return 'Sin documento';
  const type = customer.documentType === '6' ? 'RUC' : customer.documentType === '1' ? 'DNI' : 'Documento';
  return `${type} ${customer.documentNumber}`;
}
