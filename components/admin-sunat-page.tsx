'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminUi } from '@/components/admin-ui-provider';

interface LotePendiente {
  fecha: string;
  boletas: number;
  notas: number;
  totalGravado: number;
  totalIgv: number;
  totalPrecioVenta: number;
  fechaLimite: string;
  diasRestantes: number;
  vencido: boolean;
}

interface ResumenResultado {
  id: number;
  fileName?: string | null;
  ticket?: string | null;
  status: string;
  cdrCode?: string | null;
  cdrDescription?: string | null;
}

interface InformeGrupo {
  total: number;
  declaradas: number;
  pendientes: number;
  monto: number;
  montoPendiente: number;
}

interface InformeDia {
  fecha: string;
  boletas: InformeGrupo;
  facturas: InformeGrupo;
  notas: InformeGrupo;
}

type MotivoReconciliacion = 'SIN_COMPROBANTE' | 'ERROR' | 'RECHAZADO' | 'SIN_ENVIAR';

interface OrdenSinComprobante {
  orderId: number;
  code: string;
  comprobanteTipo: 'BOLETA' | 'FACTURA';
  clienteNombre: string | null;
  clienteNumDoc: string | null;
  total: number;
  fecha: string;
  motivo: MotivoReconciliacion;
  comprobanteId: number | null;
  comprobanteEstado: string | null;
}

const MOTIVO_LABEL: Record<MotivoReconciliacion, string> = {
  SIN_COMPROBANTE: 'Sin comprobante',
  ERROR: 'Error de envio',
  RECHAZADO: 'Rechazado',
  SIN_ENVIAR: 'Sin enviar',
};

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

function formatFecha(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(date);
}

function plazoBadge(lote: LotePendiente): { label: string; cls: string } {
  if (lote.vencido) {
    return { label: `Vencido hace ${Math.abs(lote.diasRestantes)} d`, cls: 'error' };
  }
  if (lote.diasRestantes <= 2) {
    return { label: `Vence en ${lote.diasRestantes} d`, cls: 'warning' };
  }
  return { label: `${lote.diasRestantes} d restantes`, cls: 'success' };
}

function esPendiente(status: string): boolean {
  return String(status || '').toUpperCase() === 'PENDING';
}

export function AdminSunatPage() {
  const { showAlert, confirm } = useAdminUi();
  const [lotes, setLotes] = useState<LotePendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generando, setGenerando] = useState<string | null>(null);
  const [consultando, setConsultando] = useState<number | null>(null);
  const [resumenes, setResumenes] = useState<ResumenResultado[]>([]);
  const [reconciliacion, setReconciliacion] = useState<OrdenSinComprobante[]>([]);
  const [reintentando, setReintentando] = useState<number | null>(null);
  const hoyISO = new Date().toISOString().slice(0, 10);
  const [fechaInforme, setFechaInforme] = useState(hoyISO);
  const [informe, setInforme] = useState<InformeDia | null>(null);

  const cargarPendientes = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch('/api/admin/sunat/pendientes', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const msg = String((payload as { error?: unknown } | null)?.error || 'No se pudieron cargar los pendientes.');
        setErrorMsg(msg);
        setLotes([]);
        return;
      }
      setLotes(Array.isArray(payload) ? (payload as LotePendiente[]) : []);
    } catch {
      setErrorMsg('No se pudieron cargar los pendientes.');
      setLotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const cargarReconciliacion = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/sunat/reconciliacion', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      setReconciliacion(response.ok && Array.isArray(payload) ? (payload as OrdenSinComprobante[]) : []);
    } catch {
      setReconciliacion([]);
    }
  }, []);

  const cargarInforme = useCallback(async (fecha: string) => {
    try {
      const response = await fetch(`/api/admin/sunat/informe-dia?fecha=${fecha}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      setInforme(response.ok ? (payload as InformeDia) : null);
    } catch {
      setInforme(null);
    }
  }, []);

  useEffect(() => {
    cargarPendientes();
    cargarReconciliacion();
  }, [cargarPendientes, cargarReconciliacion]);

  useEffect(() => {
    cargarInforme(fechaInforme);
  }, [cargarInforme, fechaInforme]);

  async function reintentarEmision(orden: OrdenSinComprobante) {
    const ok = await confirm({
      title: 'Reintentar comprobante',
      message: `Se emitira ${orden.comprobanteTipo === 'FACTURA' ? 'la Factura' : 'la Boleta'} de la venta ${orden.code} (${soles.format(orden.total)}).`,
      acceptText: 'Emitir',
      cancelText: 'Cancelar',
    });
    if (!ok) {
      return;
    }

    setReintentando(orden.orderId);
    try {
      const endpoint = orden.comprobanteTipo === 'FACTURA' ? 'factura' : 'boleta';
      const body = orden.comprobanteTipo === 'FACTURA' ? {} : { viaResumen: true };
      const response = await fetch(`/api/admin/sunat/orders/${orden.orderId}/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown } | null)?.error || 'No se pudo emitir el comprobante.'), 'error');
        return;
      }
      const c = payload as { serie?: unknown; numero?: unknown; estado?: unknown };
      showAlert(`Comprobante ${String(c.serie ?? '')}-${String(c.numero ?? '')} generado (${String(c.estado ?? '')}).`, 'success', 5000);
      cargarReconciliacion();
      cargarPendientes();
    } catch {
      showAlert('No se pudo emitir el comprobante.', 'error');
    } finally {
      setReintentando(null);
    }
  }

  function upsertResumen(resumen: ResumenResultado) {
    setResumenes((current) => {
      const previo = current.find((r) => r.id === resumen.id);
      const rest = current.filter((r) => r.id !== resumen.id);
      // Al consultar, conservar fileName/ticket previos si la respuesta no los trae.
      return [{ ...previo, ...resumen }, ...rest];
    });
  }

  async function generarResumen(lote: LotePendiente) {
    const total = `${lote.boletas} boleta(s)${lote.notas ? ` + ${lote.notas} nota(s)` : ''}`;
    const ok = await confirm({
      title: 'Declarar a SUNAT',
      message: `Se enviara el Resumen Diario del ${formatFecha(lote.fecha)} con ${total} (${soles.format(lote.totalPrecioVenta)}). Esta accion informa los comprobantes a SUNAT.`,
      acceptText: 'Declarar',
      cancelText: 'Cancelar',
    });
    if (!ok) {
      return;
    }

    setGenerando(lote.fecha);
    try {
      const response = await fetch('/api/admin/sunat/resumen-diario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fecha: lote.fecha }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown } | null)?.error || 'Error al generar el Resumen Diario.'), 'error');
        return;
      }

      const resumen = payload as ResumenResultado;
      upsertResumen(resumen);
      if (esPendiente(resumen.status)) {
        showAlert(`Resumen enviado (ticket ${resumen.ticket || '-'}). SUNAT lo esta procesando, consulta el estado en unos segundos.`, 'info');
      } else {
        showAlert(`Resumen ${resumen.status}${resumen.cdrCode ? ` (CDR ${resumen.cdrCode})` : ''}.`, 'success');
      }
      cargarPendientes();
    } catch {
      showAlert('Error al generar el Resumen Diario.', 'error');
    } finally {
      setGenerando(null);
    }
  }

  async function consultarResumen(id: number) {
    setConsultando(id);
    try {
      const response = await fetch(`/api/admin/sunat/resumen-diario/${id}/consultar`, { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String((payload as { error?: unknown } | null)?.error || 'Error al consultar el resumen.'), 'error');
        return;
      }
      const resumen = payload as ResumenResultado;
      upsertResumen({ ...resumen, id });
      if (esPendiente(resumen.status)) {
        showAlert('SUNAT sigue procesando el resumen (98). Reintenta en unos segundos.', 'info');
      } else {
        showAlert(`Resumen ${resumen.status}${resumen.cdrCode ? ` (CDR ${resumen.cdrCode})` : ''}.`, resumen.status.toUpperCase().includes('ACEPT') || resumen.status.toUpperCase().includes('ACCEPT') ? 'success' : 'warning');
      }
      cargarPendientes();
    } catch {
      showAlert('Error al consultar el resumen.', 'error');
    } finally {
      setConsultando(null);
    }
  }

  const totalBoletas = lotes.reduce((s, l) => s + l.boletas, 0);
  const totalNotas = lotes.reduce((s, l) => s + l.notas, 0);
  const totalMonto = lotes.reduce((s, l) => s + l.totalPrecioVenta, 0);
  const hayVencidos = lotes.some((l) => l.vencido);

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card inventory-header-card">
        <div>
          <p className="section-kicker">Facturacion electronica</p>
          <h1 className="section-title">Declaracion a SUNAT</h1>
          <p className="section-subtitle">Boletas y notas emitidas pendientes de informar por Resumen Diario.</p>
        </div>
        <div className="inventory-header-actions">
          <button
            type="button"
            className="admin-ghost-btn"
            onClick={() => { cargarPendientes(); cargarReconciliacion(); cargarInforme(fechaInforme); }}
            disabled={loading}
          >
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </article>

      <article className="admin-card admin-filters-card-next">
        <div>
          <h2 className="section-title" style={{ fontSize: '1.05rem' }}>Informe del dia</h2>
          <p className="section-subtitle">Comprobantes emitidos ese dia: declarados vs pendientes de informar.</p>
        </div>
        <fieldset className="admin-filters-fieldset-next">
          <legend className="admin-filters-legend-next">Periodo</legend>
          <div className="admin-filters-layout-next">
            <label className="admin-field-block">
              <span>Fecha</span>
              <input type="date" value={fechaInforme} max={hoyISO} onChange={(e) => setFechaInforme(e.target.value || hoyISO)} />
            </label>
          </div>
        </fieldset>
        {informe ? (
          <div className="dashboard-kpi-grid-next" style={{ marginTop: 12 }}>
            <article className="dashboard-kpi-card-next">
              <p>Boletas</p>
              <strong>{informe.boletas.total}</strong>
              <span>{informe.boletas.declaradas} declarada(s) · {informe.boletas.pendientes} pendiente(s)</span>
            </article>
            <article className="dashboard-kpi-card-next">
              <p>Boletas pendientes (monto)</p>
              <strong>{soles.format(informe.boletas.montoPendiente)}</strong>
              <span>de {soles.format(informe.boletas.monto)} del dia</span>
            </article>
            <article className="dashboard-kpi-card-next">
              <p>Facturas</p>
              <strong>{informe.facturas.total}</strong>
              <span>{informe.facturas.declaradas} aceptada(s) · {informe.facturas.pendientes} pendiente(s)</span>
            </article>
            <article className="dashboard-kpi-card-next">
              <p>Notas (NC/ND)</p>
              <strong>{informe.notas.total}</strong>
              <span>{informe.notas.declaradas} declarada(s) · {informe.notas.pendientes} pendiente(s)</span>
            </article>
          </div>
        ) : (
          <p className="admin-muted-text" style={{ marginTop: 12 }}>Sin datos para esa fecha.</p>
        )}
      </article>

      {reconciliacion.length > 0 ? (
        <article className="admin-card">
          <div>
            <h2 className="section-title" style={{ fontSize: '1.05rem' }}>Ventas sin comprobante</h2>
            <p className="section-subtitle">
              Ventas marcadas para facturar cuyo comprobante no se emitio o fue rechazado. Reintenta la emision.
            </p>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table mobile-card-table ops-cards-next">
              <thead>
                <tr>
                  <th>Venta</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Motivo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reconciliacion.map((orden) => (
                  <tr key={orden.orderId}>
                    <td data-label="Venta">{orden.code}</td>
                    <td data-label="Tipo">{orden.comprobanteTipo === 'FACTURA' ? 'Factura' : 'Boleta'}</td>
                    <td data-label="Cliente">{orden.clienteNombre || orden.clienteNumDoc || '-'}</td>
                    <td data-label="Total">{soles.format(orden.total)}</td>
                    <td data-label="Motivo">
                      <span className="admin-status-badge error">{MOTIVO_LABEL[orden.motivo]}</span>
                    </td>
                    <td data-label="Accion">
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-primary-btn"
                          onClick={() => reintentarEmision(orden)}
                          disabled={reintentando === orden.orderId}
                        >
                          {reintentando === orden.orderId ? 'Emitiendo...' : 'Emitir'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {!loading && lotes.length > 0 ? (
        <>
          <section className="dashboard-kpi-grid-next">
            <article className="dashboard-kpi-card-next">
              <p>Lotes pendientes</p>
              <strong>{lotes.length}</strong>
              <span>por declarar</span>
            </article>
            <article className="dashboard-kpi-card-next">
              <p>Boletas</p>
              <strong>{totalBoletas}</strong>
              <span>{totalNotas} nota(s) de boleta</span>
            </article>
            <article className="dashboard-kpi-card-next">
              <p>Monto total</p>
              <strong>{soles.format(totalMonto)}</strong>
              <span>incluye IGV</span>
            </article>
          </section>
          {hayVencidos ? (
            <article className="admin-card">
              <p className="admin-status-badge error">
                Hay lotes fuera del plazo de 7 dias. Declaralos cuanto antes.
              </p>
            </article>
          ) : null}
        </>
      ) : null}

      <article className="admin-card">
        {errorMsg ? (
          <p className="admin-muted-text">{errorMsg}</p>
        ) : loading ? (
          <p className="admin-muted-text">Cargando pendientes...</p>
        ) : lotes.length === 0 ? (
          <p className="admin-muted-text">No hay boletas ni notas pendientes de declarar.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table mobile-card-table ops-cards-next">
              <thead>
                <tr>
                  <th>Fecha emision</th>
                  <th>Comprobantes</th>
                  <th>Gravado</th>
                  <th>IGV</th>
                  <th>Total</th>
                  <th>Plazo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((lote) => {
                  const badge = plazoBadge(lote);
                  const enProceso = generando === lote.fecha;
                  return (
                    <tr key={lote.fecha}>
                      <td data-label="Fecha emision">{formatFecha(lote.fecha)}</td>
                      <td data-label="Comprobantes">
                        {lote.boletas} boleta(s){lote.notas ? ` + ${lote.notas} nota(s)` : ''}
                      </td>
                      <td data-label="Gravado">{soles.format(lote.totalGravado)}</td>
                      <td data-label="IGV">{soles.format(lote.totalIgv)}</td>
                      <td data-label="Total">{soles.format(lote.totalPrecioVenta)}</td>
                      <td data-label="Plazo">
                        <span className={`admin-status-badge ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td data-label="Accion">
                        <div className="admin-table-actions">
                          <button
                            type="button"
                            className="admin-primary-btn"
                            onClick={() => generarResumen(lote)}
                            disabled={enProceso || generando !== null}
                          >
                            {enProceso ? 'Enviando...' : 'Generar Resumen Diario'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {resumenes.length > 0 ? (
        <article className="admin-card">
          <h2 className="section-title" style={{ fontSize: '1.05rem' }}>Resumenes enviados</h2>
          <p className="section-subtitle">Consulta el estado del CDR de los resumenes enviados en esta sesion.</p>
          <div className="admin-table-wrap">
            <table className="admin-table mobile-card-table ops-cards-next">
              <thead>
                <tr>
                  <th>Archivo</th>
                  <th>Ticket</th>
                  <th>Estado</th>
                  <th>CDR</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {resumenes.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Archivo">{r.fileName || `Resumen #${r.id}`}</td>
                    <td data-label="Ticket">{r.ticket || '-'}</td>
                    <td data-label="Estado">
                      <span className={`admin-status-badge ${esPendiente(r.status) ? 'info' : 'success'}`}>{r.status}</span>
                    </td>
                    <td data-label="CDR">{r.cdrCode ? `${r.cdrCode} ${r.cdrDescription || ''}` : '-'}</td>
                    <td data-label="Accion">
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-ghost-btn"
                          onClick={() => consultarResumen(r.id)}
                          disabled={consultando === r.id}
                        >
                          {consultando === r.id ? 'Consultando...' : 'Consultar estado'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );
}
