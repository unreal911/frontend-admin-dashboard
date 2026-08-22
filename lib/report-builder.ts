export type ReportFieldType = 'text' | 'number' | 'date' | 'boolean';
export type ReportOperator = 'contains' | 'equals' | 'startsWith' | 'isEmpty' | 'greaterThan' | 'lessThan' | 'between' | 'on' | 'after' | 'before';

export interface ReportField {
  key: string;
  label: string;
  type: ReportFieldType;
}

export interface ReportSource {
  id: string;
  label: string;
  description: string;
  defaultColumns: string[];
  fields: ReportField[];
}

export interface ReportFilter {
  id: string;
  field: string;
  operator: ReportOperator;
  value: string;
  valueTo: string;
}

export interface ReportPreview {
  source: ReportSource;
  columns: ReportField[];
  rows: Array<Record<string, string | number | boolean | null>>;
  total: number;
  truncated: boolean;
}

export const REPORT_OPERATOR_OPTIONS: Record<ReportFieldType, Array<{ value: ReportOperator; label: string }>> = {
  text: [
    { value: 'contains', label: 'Contiene' }, { value: 'equals', label: 'Es igual a' },
    { value: 'startsWith', label: 'Empieza por' }, { value: 'isEmpty', label: 'Esta vacio' },
  ],
  number: [
    { value: 'equals', label: 'Es igual a' }, { value: 'greaterThan', label: 'Mayor que' },
    { value: 'lessThan', label: 'Menor que' }, { value: 'between', label: 'Entre' },
  ],
  date: [
    { value: 'on', label: 'En la fecha' }, { value: 'after', label: 'Despues de' },
    { value: 'before', label: 'Antes de' }, { value: 'between', label: 'Entre fechas' },
  ],
  boolean: [{ value: 'equals', label: 'Es igual a' }],
};

export function defaultOperator(type: ReportFieldType): ReportOperator {
  return REPORT_OPERATOR_OPTIONS[type][0]?.value || 'equals';
}

export function moveReportColumn(columns: string[], field: string, targetIndex: number): string[] {
  const without = columns.filter((column) => column !== field);
  const safeIndex = Math.max(0, Math.min(targetIndex, without.length));
  without.splice(safeIndex, 0, field);
  return without;
}

export function normalizeReportSources(payload: unknown): ReportSource[] {
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const data = Array.isArray(root.data) ? root.data : [];
  return data.flatMap((raw) => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const fields = Array.isArray(item.fields) ? item.fields.flatMap((rawField) => {
      const field = rawField && typeof rawField === 'object' ? rawField as Record<string, unknown> : {};
      const type = String(field.type || '');
      if (!field.key || !field.label || !['text', 'number', 'date', 'boolean'].includes(type)) return [];
      return [{ key: String(field.key), label: String(field.label), type: type as ReportFieldType }];
    }) : [];
    if (!item.id || !item.label || fields.length === 0) return [];
    const keys = new Set(fields.map((field) => field.key));
    return [{
      id: String(item.id), label: String(item.label), description: String(item.description || ''), fields,
      defaultColumns: (Array.isArray(item.defaultColumns) ? item.defaultColumns.map(String) : []).filter((key) => keys.has(key)),
    }];
  });
}

export function normalizeReportPreview(payload: unknown): ReportPreview | null {
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const sources = normalizeReportSources({ data: [root.source] });
  const source = sources[0];
  if (!source || !Array.isArray(root.columns) || !Array.isArray(root.rows)) return null;
  const fieldsByKey = new Map(source.fields.map((field) => [field.key, field]));
  const columns = root.columns.flatMap((column) => {
    const key = String((column as Record<string, unknown>)?.key || '');
    const field = fieldsByKey.get(key);
    return field ? [field] : [];
  });
  return {
    source, columns,
    rows: root.rows.filter((row) => row && typeof row === 'object') as ReportPreview['rows'],
    total: Math.max(0, Number(root.total) || 0), truncated: Boolean(root.truncated),
  };
}
