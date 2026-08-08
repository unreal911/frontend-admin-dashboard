import { expect, test } from '@playwright/test';
import { moveReportColumn, normalizeReportPreview, normalizeReportSources } from '@/lib/report-builder';

test('mueve y agrega columnas sin duplicarlas', () => {
  expect(moveReportColumn(['code', 'date', 'total'], 'code', 2)).toEqual(['date', 'total', 'code']);
  expect(moveReportColumn(['code', 'date'], 'total', 1)).toEqual(['code', 'total', 'date']);
  expect(moveReportColumn(['code', 'date', 'total'], 'date', 0)).toEqual(['date', 'code', 'total']);
});

test('normaliza fuentes y conserva el orden elegido en la vista previa', () => {
  const source = {
    id: 'sales', label: 'Ventas', description: 'Ventas', defaultColumns: ['code', 'total'],
    fields: [
      { key: 'code', label: 'Codigo', type: 'text' },
      { key: 'total', label: 'Total', type: 'number' },
    ],
  };
  expect(normalizeReportSources({ data: [source] })).toHaveLength(1);
  const preview = normalizeReportPreview({
    source,
    columns: [source.fields[1], source.fields[0]],
    rows: [{ code: 'V-1', total: 25 }], total: 1, truncated: false,
  });
  expect(preview?.columns.map((field) => field.key)).toEqual(['total', 'code']);
  expect(preview?.rows[0]).toEqual({ code: 'V-1', total: 25 });
});
