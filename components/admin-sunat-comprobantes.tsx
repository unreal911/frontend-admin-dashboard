'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAdminUi } from '@/components/admin-ui-provider';
import { AdminSelect } from '@/components/admin-select';

type ComprobanteTipo = 'FACTURA' | 'BOLETA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
type ComprobanteEstado =
  | 'BORRADOR' | 'ENVIADO' | 'ACEPTADO' | 'ACEPTADO_CON_OBSERVACIONES'
  | 'RECHAZADO' | 'ANULADO' | 'ERROR';

interface Dispatch {
  status?: string | null;
  cdrCode?: string | null;
  cdrDescription?: string | null;
}

interface Comprobante {
  id: number;
  tipo: ComprobanteTipo;
  serie: string;
  numero: number;
  estado: ComprobanteEstado;
  fechaEmision: string;
  clienteNombre?: string | null;
  clienteNumDoc?: string | null;
  totalPrecioVenta: number | string;
  dispatches?: Dispatch[];
}

interface SunatArtifact {
  id: string;
  type: string;
  sha256: string;
  sizeBytes: string;
  mimeType: string;
  createdAt: string;
}

type AccionTipo = 'NOTA_CREDITO' | 'NOTA_DEBITO' | 'BAJA';

interface Filtros {
  tipo: string;
  estado: string;
  desde: string;
  hasta: string;
  q: string;
  orderId: string; // deep-link: filtra por pedido de origen (no editable en el form)
}

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

const TIPO_LABEL: Record<ComprobanteTipo, string> = {
  FACTURA: 'Factura',
  BOLETA: 'Boleta',
  NOTA_CREDITO: 'Nota de credito',
  NOTA_DEBITO: 'Nota de debito',
};

const ESTADO_BADGE: Record<ComprobanteEstado, string> = {
  BORRADOR: 'info',
  ENVIADO: 'info',
  ACEPTADO: 'success',
  ACEPTADO_CON_OBSERVACIONES: 'warning',
  RECHAZADO: 'error',
  ANULADO: 'error',
  ERROR: 'error',
};

// Catalogo 09 (motivos de nota de credito).
const MOTIVOS_NC = [
  { value: '01', label: '01 - Anulacion de la operacion' },
  { value: '02', label: '02 - Anulacion por error en el RUC' },
  { value: '03', label: '03 - Correccion por error en la descripcion' },
  { value: '04', label: '04 - Descuento global' },
  { value: '05', label: '05 - Descuento por item' },
  { value: '06', label: '06 - Devolucion total' },
  { value: '07', label: '07 - Devolucion por item' },
  { value: '08', label: '08 - Bonificacion' },
  { value: '09', label: '09 - Disminucion en el valor' },
  { value: '10', label: '10 - Otros conceptos' },
];

// Catalogo 10 (motivos de nota de debito).
const MOTIVOS_ND = [
  { value: '01', label: '01 - Intereses por mora' },
  { value: '02', label: '02 - Aumento en el valor' },
  { value: '03', label: '03 - Penalidades / otros conceptos' },
];

function formatFecha(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short' }).format(date);
}

function esAceptado(estado: ComprobanteEstado): boolean {
  return estado === 'ACEPTADO' || estado === 'ACEPTADO_CON_OBSERVACIONES';
}

export function AdminSunatComprobantesPage() {
  const { showAlert, confirm } = useAdminUi();
  const searchParams = useSearchParams();
  // Deep-link desde el panel de devolucion: ?orderId=&codigo= prefiltra por pedido.
  const [filtros, setFiltros] = useState<Filtros>(() => ({
    tipo: '', estado: '', desde: '', hasta: '', q: '',
    orderId: searchParams.get('orderId')?.trim() || '',
  }));
  const [orderCodigo, setOrderCodigo] = useState<string>(() => searchParams.get('codigo')?.trim() || '');
  const [items, setItems] = useState<Comprobante[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState<number | null>(null);
  const [documentos, setDocumentos] = useState<{ comprobante: Comprobante; items: SunatArtifact[]; loading: boolean } | null>(null);

  // Modal de accion (NC / ND / Baja)
  const [accion, setAccion] = useState<{ tipo: AccionTipo; comprobante: Comprobante } | null>(null);
  const [codigoMotivo, setCodigoMotivo] = useState('01');
  const [descripcionMotivo, setDescripcionMotivo] = useState('');

  const cargar = useCallback(async (f: Filtros) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.tipo) params.set('tipo', f.tipo);
      if (f.estado) params.set('estado', f.estado);
      if (f.desde) params.set('desde', f.desde);
      if (f.hasta) params.set('hasta', f.hasta);
      if (f.q.trim()) params.set('q', f.q.trim());
      if (f.orderId.trim()) params.set('orderId', f.orderId.trim());
      params.set('take', '100');
      const response = await fetch(`/api/admin/sunat/comprobantes?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown } | null)?.error || 'No se pudieron cargar los comprobantes.'), 'error');
        setItems([]);
        setTotal(0);
        return;
      }
      const data = payload as { items?: Comprobante[]; total?: number };
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total) || 0);
    } catch {
      showAlert('No se pudieron cargar los comprobantes.', 'error');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    cargar(filtros);
    // Solo en el montaje; los cambios de filtro se aplican con el boton Buscar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrirAccion(tipo: AccionTipo, comprobante: Comprobante) {
    setAccion({ tipo, comprobante });
    setCodigoMotivo(tipo === 'NOTA_DEBITO' ? '01' : '01');
    setDescripcionMotivo('');
  }

  function cerrarAccion() {
    setAccion(null);
    setDescripcionMotivo('');
  }

  async function abrirDocumentos(comprobante: Comprobante) {
    setDocumentos({ comprobante, items: [], loading: true });
    try {
      const response = await fetch(`/api/admin/sunat/comprobantes/${comprobante.id}/artifacts`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.message || 'No se pudieron cargar los documentos.'));
      setDocumentos({ comprobante, items: Array.isArray(payload?.artifacts) ? payload.artifacts : [], loading: false });
    } catch (error) {
      setDocumentos(null);
      showAlert(error instanceof Error ? error.message : 'No se pudieron cargar los documentos.', 'error');
    }
  }

  async function descargarDocumento(artifact: SunatArtifact) {
    try {
      const response = await fetch(`/api/admin/sunat/artifacts/${artifact.id}/download`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.url) throw new Error(String(payload?.message || 'No se pudo preparar la descarga.'));
      window.open(String(payload.url), '_blank', 'noopener,noreferrer');
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'No se pudo preparar la descarga.', 'error');
    }
  }

  async function confirmarAccion() {
    if (!accion) {
      return;
    }
    const { tipo, comprobante } = accion;
    if (!descripcionMotivo.trim()) {
      showAlert('Ingresa la descripcion / sustento del motivo.', 'warning');
      return;
    }

    setProcesando(comprobante.id);
    try {
      let url = '';
      let body: unknown = {};
      if (tipo === 'BAJA') {
        url = '/api/admin/sunat/comunicacion-baja';
        body = { comprobanteId: comprobante.id, motivo: descripcionMotivo.trim() };
      } else {
        const endpoint = tipo === 'NOTA_CREDITO' ? 'nota-credito' : 'nota-debito';
        url = `/api/admin/sunat/comprobantes/${comprobante.id}/${endpoint}`;
        body = { codigoMotivo, descripcionMotivo: descripcionMotivo.trim() };
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown } | null)?.error || 'No se pudo completar la accion.'), 'error');
        return;
      }
      showAlert(
        tipo === 'BAJA' ? 'Comunicacion de baja enviada. Consulta el estado luego.' : 'Nota emitida correctamente.',
        'success',
        5000,
      );
      cerrarAccion();
      cargar(filtros);
    } catch {
      showAlert('No se pudo completar la accion.', 'error');
    } finally {
      setProcesando(null);
    }
  }

  async function anularBoleta(comprobante: Comprobante) {
    const ok = await confirm({
      title: 'Anular boleta',
      message: `La boleta ${comprobante.serie}-${comprobante.numero} se anulara via Resumen Diario (estado 3). Debe compartir fecha con otras boletas que anules a la vez.`,
      acceptText: 'Anular',
      cancelText: 'Cancelar',
    });
    if (!ok) {
      return;
    }
    setProcesando(comprobante.id);
    try {
      const response = await fetch('/api/admin/sunat/resumen-diario/anulacion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ comprobanteId: comprobante.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown } | null)?.error || 'No se pudo anular la boleta.'), 'error');
        return;
      }
      showAlert('Resumen de anulacion enviado. Consulta el estado luego.', 'success', 5000);
      cargar(filtros);
    } catch {
      showAlert('No se pudo anular la boleta.', 'error');
    } finally {
      setProcesando(null);
    }
  }

  const motivos = accion?.tipo === 'NOTA_DEBITO' ? MOTIVOS_ND : MOTIVOS_NC;

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card inventory-header-card">
        <div>
          <p className="section-kicker">Facturacion electronica</p>
          <h1 className="section-title">Comprobantes emitidos</h1>
          <p className="section-subtitle">Consulta, emite notas de credito/debito y anula comprobantes.</p>
        </div>
        <div className="inventory-header-actions">
          <button type="button" className="admin-ghost-btn" onClick={() => cargar(filtros)} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </article>

      {filtros.orderId ? (
        <article className="admin-card comprobantes-order-filter">
          <span className="comprobantes-order-filter__label">
            Mostrando comprobantes del pedido <strong>{orderCodigo || `#${filtros.orderId}`}</strong>
          </span>
          <button
            type="button"
            className="admin-ghost-btn"
            onClick={() => {
              const limpio: Filtros = { ...filtros, orderId: '' };
              setOrderCodigo('');
              setFiltros(limpio);
              cargar(limpio);
            }}
          >
            Ver todos
          </button>
        </article>
      ) : null}

      <article className="admin-card admin-filters-card-next">
        <fieldset className="admin-filters-fieldset-next">
          <legend className="admin-filters-legend-next">Filtros</legend>
          <div className="admin-filters-layout-next">
            <label className="admin-field-block">
              <span>Tipo</span>
              <AdminSelect
                value={filtros.tipo}
                ariaLabel="Tipo"
                onChange={(value) => setFiltros({ ...filtros, tipo: value })}
                options={[
                  { value: '', label: 'Todos' },
                  { value: 'FACTURA', label: 'Factura' },
                  { value: 'BOLETA', label: 'Boleta' },
                  { value: 'NOTA_CREDITO', label: 'Nota de credito' },
                  { value: 'NOTA_DEBITO', label: 'Nota de debito' },
                ]}
              />
            </label>
            <label className="admin-field-block">
              <span>Estado</span>
              <AdminSelect
                value={filtros.estado}
                ariaLabel="Estado"
                onChange={(value) => setFiltros({ ...filtros, estado: value })}
                options={[
                  { value: '', label: 'Todos' },
                  { value: 'BORRADOR', label: 'Borrador' },
                  { value: 'ENVIADO', label: 'Enviado' },
                  { value: 'ACEPTADO', label: 'Aceptado' },
                  { value: 'ACEPTADO_CON_OBSERVACIONES', label: 'Aceptado c/ observaciones' },
                  { value: 'RECHAZADO', label: 'Rechazado' },
                  { value: 'ANULADO', label: 'Anulado' },
                  { value: 'ERROR', label: 'Error' },
                ]}
              />
            </label>
            <label className="admin-field-block">
              <span>Desde</span>
              <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
            </label>
            <label className="admin-field-block">
              <span>Hasta</span>
              <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} />
            </label>
            <label className="admin-field-block">
              <span>Serie / numero</span>
              <input
                type="text"
                value={filtros.q}
                placeholder="F001 o 5"
                onChange={(e) => setFiltros({ ...filtros, q: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') cargar(filtros); }}
              />
            </label>
            <div className="admin-filters-actions-next">
              <button type="button" className="admin-primary-btn" onClick={() => cargar(filtros)} disabled={loading}>
                Buscar
              </button>
              <button
                type="button"
                className="admin-ghost-btn"
                onClick={() => { const limpio: Filtros = { tipo: '', estado: '', desde: '', hasta: '', q: '', orderId: '' }; setOrderCodigo(''); setFiltros(limpio); cargar(limpio); }}
              >
                Limpiar
              </button>
            </div>
          </div>
        </fieldset>
      </article>

      <article className="admin-card">
        {loading ? (
          <p className="admin-muted-text">Cargando comprobantes...</p>
        ) : items.length === 0 ? (
          <p className="admin-muted-text">No hay comprobantes con esos filtros.</p>
        ) : (
          <>
            <p className="admin-muted-text">{total} comprobante(s){total > items.length ? ` (mostrando ${items.length})` : ''}</p>
            <div className="admin-table-wrap">
              <table className="admin-table mobile-card-table ops-cards-next">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Serie-Numero</th>
                    <th>Cliente</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => {
                    const aceptado = esAceptado(c.estado);
                    const esNota = c.tipo === 'NOTA_CREDITO' || c.tipo === 'NOTA_DEBITO';
                    const puedeNota = aceptado && (c.tipo === 'FACTURA' || c.tipo === 'BOLETA');
                    const puedeBajaRA = aceptado && (c.tipo === 'FACTURA' || esNota);
                    const puedeAnularBoleta = aceptado && c.tipo === 'BOLETA';
                    const cdr = c.dispatches?.[0]?.cdrDescription;
                    const busy = procesando === c.id;
                    return (
                      <tr key={c.id}>
                        <td data-label="Fecha">{formatFecha(c.fechaEmision)}</td>
                        <td data-label="Tipo">{TIPO_LABEL[c.tipo]}</td>
                        <td data-label="Serie-Numero">{c.serie}-{c.numero}</td>
                        <td data-label="Cliente">{c.clienteNombre || c.clienteNumDoc || '-'}</td>
                        <td data-label="Total">{soles.format(Number(c.totalPrecioVenta))}</td>
                        <td data-label="Estado">
                          <span className={`admin-status-badge ${ESTADO_BADGE[c.estado]}`}>{c.estado}</span>
                          {cdr ? <small className="admin-muted-text" style={{ display: 'block' }}>{cdr}</small> : null}
                        </td>
                        <td data-label="Acciones">
                          <div className="admin-table-actions">
                            {puedeNota ? (
                              <>
                                <button type="button" className="admin-ghost-btn" disabled={busy} onClick={() => abrirAccion('NOTA_CREDITO', c)}>N. Credito</button>
                                <button type="button" className="admin-ghost-btn" disabled={busy} onClick={() => abrirAccion('NOTA_DEBITO', c)}>N. Debito</button>
                              </>
                            ) : null}
                            {puedeBajaRA ? (
                              <button type="button" className="admin-ghost-btn" disabled={busy} onClick={() => abrirAccion('BAJA', c)}>Anular</button>
                            ) : null}
                            {puedeAnularBoleta ? (
                              <button type="button" className="admin-ghost-btn" disabled={busy} onClick={() => anularBoleta(c)}>Anular</button>
                            ) : null}
                            <button type="button" className="admin-ghost-btn" disabled={busy} onClick={() => abrirDocumentos(c)}>Documentos</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>

      {accion ? (
        <div className="admin-modal-overlay" role="presentation" onClick={cerrarAccion}>
          <div className="admin-modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head-next">
              <div>
                <h3>
                  {accion.tipo === 'BAJA'
                    ? `Anular ${TIPO_LABEL[accion.comprobante.tipo]} ${accion.comprobante.serie}-${accion.comprobante.numero}`
                    : `${accion.tipo === 'NOTA_CREDITO' ? 'Nota de credito' : 'Nota de debito'} sobre ${accion.comprobante.serie}-${accion.comprobante.numero}`}
                </h3>
                <p>
                  {accion.tipo === 'BAJA'
                    ? 'Se comunicara la baja a SUNAT (RA). Consulta el estado luego.'
                    : 'Se emitira la nota referida a este comprobante.'}
                </p>
              </div>
              <button type="button" className="admin-modal-close-next" onClick={cerrarAccion} aria-label="Cerrar modal">x</button>
            </div>

            <div className="admin-modal-form">
              {accion.tipo !== 'BAJA' ? (
                <label>
                  <span>Motivo (catalogo {accion.tipo === 'NOTA_CREDITO' ? '09' : '10'})</span>
                  <AdminSelect
                    value={codigoMotivo}
                    ariaLabel="Motivo"
                    onChange={(value) => setCodigoMotivo(value)}
                    options={motivos.map((m) => ({ value: m.value, label: m.label }))}
                  />
                </label>
              ) : (
                <p className="admin-muted-text">
                  {accion.comprobante.tipo === 'FACTURA'
                    ? 'La factura se anula por Comunicacion de Baja (RA). Debe estar aceptada y dentro del plazo.'
                    : 'La nota se anula por Comunicacion de Baja (RA).'}
                </p>
              )}
              <label>
                <span>{accion.tipo === 'BAJA' ? 'Motivo de la baja' : 'Descripcion / sustento'}</span>
                <textarea
                  rows={3}
                  value={descripcionMotivo}
                  onChange={(e) => setDescripcionMotivo(e.target.value)}
                  placeholder={accion.tipo === 'BAJA' ? 'Ej. Error en los datos del comprobante' : 'Detalle del motivo'}
                />
              </label>

              <div className="admin-modal-actions">
                <button type="button" className="admin-ghost-btn" onClick={cerrarAccion}>Cancelar</button>
                <button
                  type="button"
                  className="admin-primary-btn"
                  disabled={procesando === accion.comprobante.id}
                  onClick={confirmarAccion}
                >
                  {procesando === accion.comprobante.id ? 'Procesando...' : (accion.tipo === 'BAJA' ? 'Anular' : 'Emitir nota')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {documentos ? (
        <div className="admin-modal-overlay" role="presentation" onClick={() => setDocumentos(null)}>
          <div className="admin-modal-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-head-next">
              <div>
                <h3>Documentos {documentos.comprobante.serie}-{documentos.comprobante.numero}</h3>
                <p>Enlaces privados de cinco minutos. El bucket y la clave interna no se exponen.</p>
              </div>
              <button type="button" className="admin-modal-close-next" onClick={() => setDocumentos(null)} aria-label="Cerrar modal">x</button>
            </div>
            {documentos.loading ? <p>Cargando documentos...</p> : documentos.items.length === 0 ? (
              <p className="admin-muted-text">Todavía no hay artefactos verificados.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table mobile-card-table">
                  <thead><tr><th>Tipo</th><th>Tamaño</th><th>Hash</th><th></th></tr></thead>
                  <tbody>{documentos.items.map((artifact) => (
                    <tr key={artifact.id}>
                      <td data-label="Tipo">{artifact.type.replaceAll('_', ' ')}</td>
                      <td data-label="Tamaño">{Math.ceil(Number(artifact.sizeBytes) / 1024)} KB</td>
                      <td data-label="Hash"><code title={artifact.sha256}>{artifact.sha256.slice(0, 12)}...</code></td>
                      <td data-label="Acción"><button type="button" className="admin-primary-btn" onClick={() => descargarDocumento(artifact)}>Descargar</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
