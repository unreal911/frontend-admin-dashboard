'use client';

import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { AdminSelect, AdminSelectOption } from '@/components/admin-select';
import { useAdminUi } from '@/components/admin-ui-provider';
import { AdminTableEmptyState } from '@/components/admin-table-empty-state';
import {
  defaultOperator,
  moveReportColumn,
  normalizeReportPreview,
  normalizeReportSources,
  REPORT_OPERATOR_OPTIONS,
  ReportField,
  ReportFilter,
  ReportOperator,
  ReportPreview,
  ReportSource,
} from '@/lib/report-builder';

type SavedDesign = {
  id: string;
  name: string;
  sourceId: string;
  columns: string[];
  filters: ReportFilter[];
  sortField: string;
  sortDirection: 'asc' | 'desc';
};

const CURRENCY_FIELDS = new Set(['price', 'subtotal', 'tax', 'total', 'purchasedTotal']);
const BOOLEAN_OPTIONS: AdminSelectOption[] = [
  { value: 'true', label: 'Si' }, { value: 'false', label: 'No' },
];
const SORT_DIRECTION_OPTIONS: AdminSelectOption<'asc' | 'desc'>[] = [
  { value: 'asc', label: 'Ascendente' }, { value: 'desc', label: 'Descendente' },
];

function designId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function filterId() {
  return `filter-${designId()}`;
}

function formatCell(field: ReportField, value: string | number | boolean | null) {
  if (value === null || value === '') return '-';
  if (field.type === 'boolean') return value ? 'Si' : 'No';
  if (field.type === 'number') {
    const formatted = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value));
    return CURRENCY_FIELDS.has(field.key) ? `S/ ${formatted}` : formatted;
  }
  if (field.type === 'date') {
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'short', timeStyle: 'short',
    }).format(parsed);
  }
  return String(value);
}

function errorMessage(payload: unknown, fallback: string) {
  const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return String(data.message || data.error || fallback);
}

export function AdminReportBuilderPage() {
  const { user, hasPermission } = useAdminAuth();
  const { confirm, showAlert } = useAdminUi();
  const [sources, setSources] = useState<ReportSource[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [columns, setColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [designName, setDesignName] = useState('');
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>([]);
  const [savedDesignId, setSavedDesignId] = useState('');
  const draggedField = useRef<{ key: string; origin: 'available' | 'selected' } | null>(null);

  const source = useMemo(() => sources.find((item) => item.id === sourceId) || null, [sourceId, sources]);
  const selectedFields = useMemo(() => columns.flatMap((key) => {
    const field = source?.fields.find((item) => item.key === key);
    return field ? [field] : [];
  }), [columns, source]);
  const availableFields = useMemo(() => source?.fields.filter((field) => !columns.includes(field.key)) || [], [columns, source]);
  const storageKey = user?.tenant.id ? `admin-report-designs:${user.tenant.id}` : '';

  const buildBody = useCallback((overrides?: Partial<{ sourceId: string; columns: string[]; filters: ReportFilter[]; sortField: string; sortDirection: 'asc' | 'desc'; limit: number }>) => ({
    source: overrides?.sourceId ?? sourceId,
    columns: overrides?.columns ?? columns,
    filters: (overrides?.filters ?? filters).map(({ field, operator, value, valueTo }) => ({ field, operator, value, valueTo })),
    sort: { field: overrides?.sortField ?? sortField, direction: overrides?.sortDirection ?? sortDirection },
    limit: overrides?.limit ?? 100,
  }), [columns, filters, sortDirection, sortField, sourceId]);

  const requestPreview = useCallback(async (body: ReturnType<typeof buildBody>) => {
    setGenerating(true);
    try {
      const response = await fetch('/api/admin/reports/preview', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload, 'No se pudo generar la vista previa.'));
      const normalized = normalizeReportPreview(payload);
      if (!normalized) throw new Error('El reporte devolvio una respuesta no valida.');
      setPreview(normalized);
    } catch (caught) {
      setPreview(null);
      showAlert(caught instanceof Error ? caught.message : 'No se pudo generar la vista previa.', 'error');
    } finally {
      setGenerating(false);
    }
  }, [showAlert]);

  useEffect(() => {
    let cancelled = false;
    async function loadSources() {
      setLoading(true);
      try {
        const response = await fetch('/api/admin/reports/sources', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorMessage(payload, 'No se pudieron cargar las fuentes.'));
        const normalized = normalizeReportSources(payload);
        if (cancelled) return;
        setSources(normalized);
        const first = normalized[0];
        if (first) {
          const initialSort = first.id === 'sales' ? 'createdAt' : first.defaultColumns[0] || first.fields[0]?.key || '';
          setSourceId(first.id);
          setColumns(first.defaultColumns);
          setSortField(initialSort);
          setSortDirection(first.id === 'sales' ? 'desc' : 'asc');
          await requestPreview({
            source: first.id, columns: first.defaultColumns, filters: [],
            sort: { field: initialSort, direction: first.id === 'sales' ? 'desc' : 'asc' },
            limit: 100,
          });
        }
      } catch (caught) {
        if (!cancelled) showAlert(caught instanceof Error ? caught.message : 'No se pudieron cargar las fuentes.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSources();
    return () => { cancelled = true; };
  }, [requestPreview, showAlert]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      setSavedDesigns(Array.isArray(saved) ? saved : []);
    } catch { setSavedDesigns([]); }
  }, [storageKey]);

  function changeSource(nextId: string) {
    const next = sources.find((item) => item.id === nextId);
    if (!next) return;
    const nextSort = next.id === 'sales' ? 'createdAt' : next.defaultColumns[0] || next.fields[0]?.key || '';
    setSourceId(next.id);
    setColumns(next.defaultColumns);
    setFilters([]);
    setSortField(nextSort);
    setSortDirection(next.id === 'sales' ? 'desc' : 'asc');
    setPreview(null);
    setSavedDesignId('');
  }

  function addColumn(key: string, targetIndex = columns.length) {
    if (!source?.fields.some((field) => field.key === key)) return;
    setColumns((current) => moveReportColumn(current, key, targetIndex));
    setPreview(null);
  }

  function dropColumn(event: DragEvent<HTMLElement>, targetIndex: number) {
    event.preventDefault();
    const dragged = draggedField.current;
    if (!dragged) return;
    addColumn(dragged.key, targetIndex);
    draggedField.current = null;
  }

  function addFilter() {
    const field = selectedFields[0] || source?.fields[0];
    if (!field) return;
    setFilters((current) => [...current, {
      id: filterId(), field: field.key, operator: defaultOperator(field.type), value: field.type === 'boolean' ? 'true' : '', valueTo: '',
    }]);
    setPreview(null);
  }

  function updateFilter(id: string, patch: Partial<ReportFilter>) {
    setFilters((current) => current.map((filter) => filter.id === id ? { ...filter, ...patch } : filter));
    setPreview(null);
  }

  async function generate() {
    if (columns.length === 0) {
      showAlert('Arrastra o agrega al menos una columna al reporte.', 'warning');
      return;
    }
    const incomplete = filters.some((filter) => {
      if (filter.operator === 'isEmpty') return false;
      return !filter.value || (filter.operator === 'between' && !filter.valueTo);
    });
    if (incomplete) {
      showAlert('Completa los valores de todos los filtros.', 'warning');
      return;
    }
    await requestPreview(buildBody());
  }

  async function exportExcel() {
    if (columns.length === 0) return;
    setExporting(true);
    try {
      const response = await fetch('/api/admin/reports/export', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildBody({ limit: 10_000 })),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(errorMessage(payload, 'No se pudo exportar el reporte.'));
      }
      const blob = await response.blob();
      const disposition = String(response.headers.get('content-disposition') || '');
      const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `reporte-${sourceId}.xlsx`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      showAlert(`Excel generado con ${response.headers.get('x-export-rows') || preview?.rows.length || 0} filas.`, 'success');
    } catch (caught) {
      showAlert(caught instanceof Error ? caught.message : 'No se pudo exportar el reporte.', 'error');
    } finally { setExporting(false); }
  }

  function saveDesign() {
    const name = designName.trim();
    if (!name) {
      showAlert('Escribe un nombre para guardar este diseño.', 'warning');
      return;
    }
    const saved: SavedDesign = {
      id: designId(), name, sourceId, columns, filters, sortField, sortDirection,
    };
    const next = [...savedDesigns.filter((item) => item.name.toLowerCase() !== name.toLowerCase()), saved];
    setSavedDesigns(next);
    setSavedDesignId(saved.id);
    setDesignName('');
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
    showAlert('Diseño guardado en este dispositivo.', 'success');
  }

  function loadDesign(id: string) {
    setSavedDesignId(id);
    const saved = savedDesigns.find((item) => item.id === id);
    const savedSource = sources.find((item) => item.id === saved?.sourceId);
    if (!saved || !savedSource) return;
    const validKeys = new Set(savedSource.fields.map((field) => field.key));
    setSourceId(savedSource.id);
    setColumns(saved.columns.filter((key) => validKeys.has(key)));
    setFilters(saved.filters.filter((filter) => validKeys.has(filter.field)));
    setSortField(validKeys.has(saved.sortField) ? saved.sortField : savedSource.defaultColumns[0] || '');
    setSortDirection(saved.sortDirection);
    setPreview(null);
  }

  async function deleteDesign() {
    const saved = savedDesigns.find((item) => item.id === savedDesignId);
    if (!saved) return;
    const accepted = await confirm({
      title: 'Eliminar diseño', message: `¿Deseas eliminar "${saved.name}"?`, acceptText: 'Eliminar', cancelText: 'Cancelar',
    });
    if (!accepted) return;
    const next = savedDesigns.filter((item) => item.id !== saved.id);
    setSavedDesigns(next);
    setSavedDesignId('');
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
  }

  if (loading) return <article className="admin-card"><h1>Cargando constructor de reportes...</h1></article>;
  if (!source) return <article className="admin-card"><h1>Reportes no disponibles</h1><p>No tienes acceso a una fuente de datos para reportes.</p></article>;

  const sourceOptions: AdminSelectOption[] = sources.map((item) => ({ value: item.id, label: item.label }));
  const fieldOptions: AdminSelectOption[] = source.fields.map((field) => ({ value: field.key, label: field.label }));
  const savedOptions: AdminSelectOption[] = [
    { value: '', label: 'Selecciona un diseño' }, ...savedDesigns.map((design) => ({ value: design.id, label: design.name })),
  ];

  return (
    <section className="admin-report-page-next">
      <header className="admin-report-title-next">
        <div><span>Analisis</span><h1>Constructor de reportes</h1><p>Combina columnas, aplica filtros y exporta exactamente el resultado que necesitas.</p></div>
        <button type="button" className="admin-primary-btn" onClick={() => void exportExcel()} disabled={exporting || generating || columns.length === 0 || !hasPermission('reports.export')}>
          {exporting ? 'Preparando Excel...' : 'Exportar a Excel'}
        </button>
      </header>

      <article className="admin-card admin-report-source-card-next">
        <label className="admin-form-field"><span>Fuente de datos</span><AdminSelect value={sourceId} options={sourceOptions} ariaLabel="Fuente del reporte" onChange={changeSource} /></label>
        <div className="admin-report-source-copy-next"><strong>{source.label}</strong><span>{source.description}</span></div>
        <div className="admin-report-saved-next">
          <label className="admin-form-field"><span>Mis diseños</span><AdminSelect value={savedDesignId} options={savedOptions} ariaLabel="Diseños de reporte guardados" onChange={loadDesign} /></label>
          <button type="button" className="admin-ghost-btn" onClick={() => void deleteDesign()} disabled={!savedDesignId}>Eliminar</button>
        </div>
      </article>

      <div className="admin-report-builder-grid-next">
        <article className="admin-card admin-report-fields-next">
          <header><div><span className="admin-report-step-next">1</span><div><h2>Campos disponibles</h2><p>Arrastra o pulsa + para agregar.</p></div></div><small>{availableFields.length} disponibles</small></header>
          <div className="admin-report-field-palette-next">
            {availableFields.length === 0 ? <p className="admin-muted-text">Todos los campos fueron agregados.</p> : availableFields.map((field) => (
              <div key={field.key} className="admin-report-field-chip-next" draggable onDragStart={() => { draggedField.current = { key: field.key, origin: 'available' }; }}>
                <span className="admin-report-drag-next" aria-hidden="true">⠿</span><div><strong>{field.label}</strong><small>{field.type === 'text' ? 'Texto' : field.type === 'number' ? 'Numero' : field.type === 'date' ? 'Fecha' : 'Si / No'}</small></div>
                <button type="button" onClick={() => addColumn(field.key)} aria-label={`Agregar ${field.label}`}>+</button>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-card admin-report-columns-next" onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropColumn(event, columns.length)}>
          <header><div><span className="admin-report-step-next">2</span><div><h2>Columnas del reporte</h2><p>Arrastra para cambiar el orden.</p></div></div><small>{columns.length} seleccionadas</small></header>
          <div className={`admin-report-dropzone-next ${columns.length === 0 ? 'empty' : ''}`} data-testid="report-columns-dropzone">
            {selectedFields.length === 0 ? <p>Arrastra aquí los campos que deseas mostrar.</p> : selectedFields.map((field, index) => (
              <div key={field.key} className="admin-report-selected-field-next" draggable
                onDragStart={(event) => { event.stopPropagation(); draggedField.current = { key: field.key, origin: 'selected' }; }}
                onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }} onDrop={(event) => { event.stopPropagation(); dropColumn(event, index); }}>
                <span className="admin-report-order-next">{index + 1}</span><span className="admin-report-drag-next" aria-hidden="true">⠿</span><strong>{field.label}</strong>
                <div className="admin-report-column-actions-next">
                  <button type="button" onClick={() => addColumn(field.key, index - 1)} disabled={index === 0} aria-label={`Subir ${field.label}`}>↑</button>
                  <button type="button" onClick={() => addColumn(field.key, index + 1)} disabled={index === selectedFields.length - 1} aria-label={`Bajar ${field.label}`}>↓</button>
                  <button type="button" onClick={() => { setColumns((current) => current.filter((key) => key !== field.key)); setPreview(null); }} aria-label={`Quitar ${field.label}`}>×</button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="admin-card admin-report-filters-next">
        <header><div><span className="admin-report-step-next">3</span><div><h2>Filtros personalizados</h2><p>Todos los filtros se combinan para precisar el resultado.</p></div></div><button type="button" className="admin-ghost-btn" onClick={addFilter}>+ Agregar filtro</button></header>
        {filters.length === 0 ? <div className="admin-report-empty-filter-next"><strong>Sin filtros</strong><span>El reporte incluirá todos los registros de esta fuente.</span></div> : (
          <div className="admin-report-filter-list-next">{filters.map((filter, index) => {
            const field = source.fields.find((item) => item.key === filter.field) || source.fields[0]!;
            const operators = REPORT_OPERATOR_OPTIONS[field.type];
            const valueType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';
            return <div key={filter.id} className="admin-report-filter-row-next">
              <span className="admin-report-filter-index-next">{index + 1}</span>
              <label><span>Campo</span><AdminSelect value={filter.field} options={fieldOptions} ariaLabel={`Campo del filtro ${index + 1}`} onChange={(nextField) => {
                const next = source.fields.find((item) => item.key === nextField)!;
                updateFilter(filter.id, { field: nextField, operator: defaultOperator(next.type), value: next.type === 'boolean' ? 'true' : '', valueTo: '' });
              }} /></label>
              <label><span>Condicion</span><AdminSelect value={filter.operator} options={operators} ariaLabel={`Condicion del filtro ${index + 1}`} onChange={(operator: ReportOperator) => updateFilter(filter.id, { operator, valueTo: '' })} /></label>
              {filter.operator === 'isEmpty' ? <div className="admin-report-filter-note-next">No requiere valor</div> : field.type === 'boolean' ? (
                <label><span>Valor</span><AdminSelect value={filter.value || 'true'} options={BOOLEAN_OPTIONS} ariaLabel={`Valor del filtro ${index + 1}`} onChange={(value) => updateFilter(filter.id, { value })} /></label>
              ) : <label><span>{filter.operator === 'between' ? 'Desde' : 'Valor'}</span><input type={valueType} value={filter.value} onChange={(event) => updateFilter(filter.id, { value: event.target.value })} /></label>}
              {filter.operator === 'between' ? <label><span>Hasta</span><input type={valueType} value={filter.valueTo} onChange={(event) => updateFilter(filter.id, { valueTo: event.target.value })} /></label> : null}
              <button type="button" className="admin-report-remove-filter-next" onClick={() => { setFilters((current) => current.filter((item) => item.id !== filter.id)); setPreview(null); }} aria-label={`Eliminar filtro ${index + 1}`}>×</button>
            </div>;
          })}</div>
        )}
      </article>

      <article className="admin-card admin-report-actions-card-next">
        <div className="admin-report-sort-next">
          <label><span>Ordenar por</span><AdminSelect value={sortField} options={fieldOptions} ariaLabel="Campo para ordenar" onChange={(value) => { setSortField(value); setPreview(null); }} /></label>
          <label><span>Direccion</span><AdminSelect value={sortDirection} options={SORT_DIRECTION_OPTIONS} ariaLabel="Direccion del orden" onChange={(value) => { setSortDirection(value); setPreview(null); }} /></label>
        </div>
        <div className="admin-report-save-next"><label><span>Nombre del diseño</span><input value={designName} maxLength={80} placeholder="Ej. Ventas del mes" onChange={(event) => setDesignName(event.target.value)} /></label><button type="button" className="admin-ghost-btn" onClick={saveDesign}>Guardar diseño</button></div>
        <button type="button" className="admin-primary-btn admin-report-generate-next" onClick={() => void generate()} disabled={generating || columns.length === 0}>{generating ? 'Generando...' : 'Generar vista previa'}</button>
      </article>

      <article className="admin-card admin-report-preview-next">
        <header><div><span className="admin-report-step-next">4</span><div><h2>Vista previa</h2><p>{preview ? `${preview.total} registros coinciden${preview.truncated ? `; se muestran los primeros ${preview.rows.length}` : ''}.` : 'Genera el reporte para visualizar los resultados.'}</p></div></div>{preview ? <span className="admin-pill success">{preview.columns.length} columnas</span> : null}</header>
        {preview ? <div className="admin-table-wrap"><table className="admin-table mobile-card-table admin-report-table-next"><thead><tr>{preview.columns.map((field) => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>
          {preview.rows.length === 0 ? (
            <tr>
              <AdminTableEmptyState
                colSpan={preview.columns.length}
                title="No encontramos registros"
                description="Ajusta los filtros del reporte y genera una nueva vista previa."
              />
            </tr>
          ) : preview.rows.map((row, rowIndex) => <tr key={rowIndex}>{preview.columns.map((field) => <td key={field.key} data-label={field.label}>{formatCell(field, row[field.key] ?? null)}</td>)}</tr>)}
        </tbody></table></div> : <div className="admin-report-preview-empty-next"><span aria-hidden="true">▦</span><strong>Tu reporte aparecerá aquí</strong><p>Selecciona columnas, agrega los filtros necesarios y genera una vista previa.</p></div>}
      </article>
    </section>
  );
}
