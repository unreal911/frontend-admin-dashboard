'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { AdminSelect, AdminSelectOption } from '@/components/admin-select';
import { useAdminUi } from '@/components/admin-ui-provider';
import { AdminButton, AdminPageHeader } from '@/components/admin-design-system';
import { AdminTableEmptyState } from '@/components/admin-table-empty-state';
import {
  AdminCustomer,
  customerDocumentLabel,
  normalizeCustomer,
  normalizeCustomersResponse,
} from '@/lib/admin-customer-types';

type CustomerForm = {
  name: string;
  documentType: string;
  documentNumber: string;
  email: string;
  phone: string;
  address: string;
  isActive: boolean;
};

type CustomerActiveFilter = 'all' | 'active' | 'inactive';

type CustomerAttentionDetail = AdminCustomer & {
  summary: { orderCount: number; totalPurchased: number; lastPurchaseAt: string | null };
  recentOrders: Array<{ id: number; code: string; status: string; salesChannel: string; total: number; createdAt: string }>;
};

const CUSTOMER_STATUS_OPTIONS: AdminSelectOption<CustomerActiveFilter>[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
];

const CUSTOMER_DOCUMENT_OPTIONS: AdminSelectOption[] = [
  { value: '1', label: 'DNI' },
  { value: '6', label: 'RUC' },
  { value: '4', label: 'Carnet de extranjeria' },
  { value: '7', label: 'Pasaporte' },
];

const EMPTY_FORM: CustomerForm = {
  name: '', documentType: '1', documentNumber: '', email: '', phone: '', address: '', isActive: true,
};

function formFromCustomer(customer: AdminCustomer): CustomerForm {
  return {
    name: customer.name,
    documentType: customer.documentType || '1',
    documentNumber: customer.documentNumber,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    isActive: customer.isActive,
  };
}

export function AdminCustomersPage() {
  const { hasPermission } = useAdminAuth();
  const { confirm, showAlert } = useAdminUi();
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<CustomerActiveFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCustomer | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [attention, setAttention] = useState<CustomerAttentionDetail | null>(null);
  const [loadingAttention, setLoadingAttention] = useState(false);
  const canManage = hasPermission('customers.manage');

  const loadCustomers = useCallback(async (query: string, status: CustomerActiveFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '200' });
      if (query.trim()) params.set('search', query.trim());
      if (status !== 'all') params.set('isActive', status === 'active' ? 'true' : 'false');
      const response = await fetch(`/api/admin/customers?${params}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String((payload as { message?: unknown } | null)?.message || 'No se pudieron cargar los clientes.'));
      const normalized = normalizeCustomersResponse(payload);
      setCustomers(normalized.data);
      setTotal(normalized.total);
    } catch (caught) {
      setCustomers([]);
      setTotal(0);
      showAlert(caught instanceof Error ? caught.message : 'No se pudieron cargar los clientes.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => { void loadCustomers('', 'all'); }, [loadCustomers]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(customer: AdminCustomer) {
    setEditing(customer);
    setForm(formFromCustomer(customer));
    setFormError('');
    setModalOpen(true);
  }

  function closeModal() {
    if (!saving) setModalOpen(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    if (form.name.trim().length < 2) {
      setFormError('Ingresa el nombre o razon social del cliente.');
      return;
    }
    const expectedLength = form.documentType === '6' ? 11 : form.documentType === '1' ? 8 : 0;
    if (form.documentNumber && expectedLength && form.documentNumber.length !== expectedLength) {
      setFormError(`${form.documentType === '6' ? 'El RUC' : 'El DNI'} debe tener ${expectedLength} digitos.`);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(editing ? `/api/admin/customers/${editing.id}` : '/api/admin/customers', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, name: form.name.trim(), documentNumber: form.documentNumber.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setFormError(String((payload as { message?: unknown } | null)?.message || 'No se pudo guardar el cliente.'));
        return;
      }
      const saved = normalizeCustomer(payload);
      if (saved) {
        setCustomers((current) => editing
          ? current.map((item) => item.id === saved.id ? saved : item)
          : [saved, ...current]);
      }
      setModalOpen(false);
      await loadCustomers(search, activeFilter);
      showAlert(`Cliente ${editing ? 'actualizado' : 'registrado'} correctamente.`, 'success');
    } catch {
      setFormError('No se pudo guardar el cliente.');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(customer: AdminCustomer) {
    const activate = !customer.isActive;
    const accepted = await confirm({
      title: `${activate ? 'Activar' : 'Desactivar'} cliente`,
      message: `¿Deseas ${activate ? 'activar' : 'desactivar'} a "${customer.name}"?`,
      acceptText: activate ? 'Activar' : 'Desactivar', cancelText: 'Cancelar',
    });
    if (!accepted) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/customers/${customer.id}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...formFromCustomer(customer), isActive: activate }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String((payload as { message?: unknown } | null)?.message || 'No se pudo cambiar el estado.'));
      await loadCustomers(search, activeFilter);
      showAlert(`Cliente ${activate ? 'activado' : 'desactivado'}.`, 'success');
    } catch (caught) {
      showAlert(caught instanceof Error ? caught.message : 'No se pudo cambiar el estado.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function openAttention(customer: AdminCustomer) {
    setLoadingAttention(true);
    try {
      const response = await fetch(`/api/admin/customers/${customer.id}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(payload?.message || 'No se pudo consultar el cliente.'));
      setAttention(payload as CustomerAttentionDetail);
    } catch (caught) {
      showAlert(caught instanceof Error ? caught.message : 'No se pudo consultar el cliente.', 'error');
    } finally {
      setLoadingAttention(false);
    }
  }

  function whatsappUrl(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    const international = digits.length === 9 ? `51${digits}` : digits;
    return `https://wa.me/${international}`;
  }

  return (
    <section className="admin-dashboard-grid">
      <AdminPageHeader
        eyebrow="Ventas"
        title="Clientes y atencion"
        description="Consulta la ficha, compras y canales de contacto de cada cliente."
        actions={canManage ? <AdminButton type="button" onClick={openCreate}>Nuevo cliente</AdminButton> : undefined}
      />
      <article className="admin-card admin-filters-card-next">
        <fieldset className="admin-filters-fieldset-next">
          <legend className="admin-filters-legend-next">Filtros</legend>
          <div className="admin-filters-layout-next">
            <div className="admin-toolbar-join-next">
              <input
                type="search" value={search} placeholder="Nombre, DNI, RUC, correo o telefono"
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void loadCustomers(search, activeFilter); }}
              />
              <button type="button" className="admin-ghost-btn" onClick={() => void loadCustomers(search, activeFilter)} disabled={loading}>Buscar</button>
            </div>
            <div className="admin-toolbar-checks-next">
              <label className="admin-form-field">
                <span>Estado</span>
                <AdminSelect
                  value={activeFilter}
                  options={CUSTOMER_STATUS_OPTIONS}
                  ariaLabel="Estado de clientes"
                  onChange={(status) => {
                  setActiveFilter(status);
                  void loadCustomers(search, status);
                  }}
                />
              </label>
            </div>
            <div className="admin-filters-actions-next">
              <span className="admin-muted-text">{total} registrados</span>
            </div>
          </div>
        </fieldset>

        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table list-cards-next">
            <thead><tr><th>Cliente</th><th>Documento</th><th>Contacto</th><th>Direccion</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6}>Cargando clientes...</td></tr> : customers.length === 0 ? (
                <tr>
                  <AdminTableEmptyState
                    colSpan={6}
                    title="No encontramos clientes"
                    description="Prueba con otro nombre, documento o dato de contacto."
                  />
                </tr>
              ) : customers.map((customer) => (
                <tr key={customer.id}>
                  <td data-label="Cliente" className="list-card-title-next">{customer.name}</td>
                  <td data-label="Documento">{customerDocumentLabel(customer)}</td>
                  <td data-label="Contacto"><div>{customer.phone || '-'}</div><small>{customer.email || ''}</small></td>
                  <td data-label="Direccion">{customer.address || '-'}</td>
                  <td data-label="Estado"><span className={`admin-pill ${customer.isActive ? 'success' : 'error'}`}>{customer.isActive ? 'Activo' : 'Inactivo'}</span></td>
                  <td data-label="Acciones"><div className="admin-table-actions">
                    <button type="button" className="admin-ghost-btn" disabled={loadingAttention} onClick={() => void openAttention(customer)}>Atender</button>
                    {canManage ? <><button type="button" className="admin-ghost-btn" onClick={() => openEdit(customer)}>Editar</button>
                    <button type="button" className="admin-ghost-btn" disabled={saving} onClick={() => void toggle(customer)}>{customer.isActive ? 'Desactivar' : 'Activar'}</button></> : '-'}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {attention ? <div className="admin-modal-overlay" role="presentation" onClick={() => setAttention(null)}>
        <article className="admin-modal-dialog admin-customer-modal-next" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <header className="admin-modal-head-next"><div><h3>{attention.name}</h3><p>{customerDocumentLabel(attention)}</p></div>
            <button type="button" className="admin-modal-close-next" onClick={() => setAttention(null)} aria-label="Cerrar">×</button></header>
          <div className="admin-dashboard-grid">
            <div className="admin-table-actions">
              <Link className="admin-primary-btn" href="/admin/orders/pos">Nueva venta</Link>
              <Link className="admin-ghost-btn" href={`/admin/orders/list?search=${encodeURIComponent(attention.name)}`}>Ver pedidos</Link>
              {attention.phone ? <a className="admin-ghost-btn" href={whatsappUrl(attention.phone)} target="_blank" rel="noreferrer">Contactar por WhatsApp</a> : null}
            </div>
            <div className="admin-card">
              <p><strong>{attention.summary.orderCount}</strong> pedidos · <strong>S/ {Number(attention.summary.totalPurchased).toFixed(2)}</strong> acumulado</p>
              <p className="admin-muted-text">Ultima compra: {attention.summary.lastPurchaseAt ? new Date(attention.summary.lastPurchaseAt).toLocaleString('es-PE') : 'Sin compras'}</p>
              <p>{attention.phone || 'Sin telefono'} · {attention.email || 'Sin correo'}</p>
            </div>
            <div className="admin-table-wrap"><table className="admin-table mobile-card-table"><thead><tr><th>Pedido</th><th>Estado</th><th>Canal</th><th>Total</th><th>Fecha</th></tr></thead>
              <tbody>{attention.recentOrders.length ? attention.recentOrders.map((order) => <tr key={order.id}>
                <td><Link href={`/admin/orders/${order.id}`}>{order.code}</Link></td><td>{order.status}</td><td>{order.salesChannel}</td><td>S/ {Number(order.total).toFixed(2)}</td><td>{new Date(order.createdAt).toLocaleDateString('es-PE')}</td>
              </tr>) : <tr><td colSpan={5}>Este cliente aun no tiene pedidos.</td></tr>}</tbody></table></div>
          </div>
        </article>
      </div> : null}

      {modalOpen ? <div className="admin-modal-overlay" role="presentation" onClick={closeModal}>
        <article className="admin-modal-dialog admin-customer-modal-next" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <header className="admin-modal-head-next"><div><h3>{editing ? 'Editar cliente' : 'Registrar cliente'}</h3><p>Estos datos se podrán recuperar por nombre o documento desde el POS.</p></div>
            <button type="button" className="admin-modal-close-next" onClick={closeModal} aria-label="Cerrar">×</button></header>
          <form className="admin-modal-form admin-customer-form-next" onSubmit={save}>
            <label className="admin-customer-wide-next"><span>Nombre o razon social *</span><input autoFocus value={form.name} maxLength={160} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label><span>Tipo de documento</span><AdminSelect value={form.documentType} options={CUSTOMER_DOCUMENT_OPTIONS} ariaLabel="Tipo de documento del cliente" onChange={(documentType) => setForm({ ...form, documentType, documentNumber: '' })} /></label>
            <label><span>Numero de documento</span><input value={form.documentNumber} maxLength={form.documentType === '6' ? 11 : 15} onChange={(event) => setForm({ ...form, documentNumber: event.target.value.replace(/[^a-zA-Z0-9-]/g, '') })} /></label>
            <label><span>Telefono</span><input value={form.phone} maxLength={30} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            <label><span>Correo</span><input type="email" value={form.email} maxLength={160} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label className="admin-customer-wide-next"><span>Direccion</span><input value={form.address} maxLength={250} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
            <label className="admin-checkbox admin-customer-wide-next"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Cliente activo</label>
            {formError ? <p className="admin-modal-error admin-customer-wide-next">{formError}</p> : null}
            <div className="admin-modal-actions admin-customer-wide-next"><button type="button" className="admin-ghost-btn" onClick={closeModal} disabled={saving}>Cancelar</button><button type="submit" className="admin-primary-btn" disabled={saving}>{saving ? 'Guardando...' : 'Guardar cliente'}</button></div>
          </form>
        </article>
      </div> : null}
    </section>
  );
}
