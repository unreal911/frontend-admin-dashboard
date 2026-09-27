'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminSelect, AdminSelectOption } from '@/components/admin-select';
import { useAdminUi } from '@/components/admin-ui-provider';
import { AdminTableEmptyState } from '@/components/admin-table-empty-state';
import { useAdminAuth } from '@/components/admin-auth-provider';

type InvitationRole = 'ADMIN' | 'MANAGER' | 'SELLER' | 'WAREHOUSE' | 'PICKER' | 'VIEWER';

const INVITATION_ROLE_OPTIONS: AdminSelectOption<InvitationRole>[] = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'SELLER', label: 'Vendedor' },
  { value: 'WAREHOUSE', label: 'Almacen' },
  { value: 'PICKER', label: 'Picking' },
  { value: 'VIEWER', label: 'Consulta' },
];

interface TenantInvitation {
  id: string;
  email: string | null;
  phone: string | null;
  role: InvitationRole;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

function invitationList(payload: unknown): TenantInvitation[] {
  const rows = (payload as { invitations?: unknown } | null)?.invitations;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((item) => {
    const row = item as Partial<TenantInvitation>;
    const id = String(row.id || '');
    const email = row.email ? String(row.email) : null;
    const phone = row.phone ? String(row.phone) : null;
    if (!id || (!email && !phone)) return [];
    return [{
      id,
      email,
      phone,
      role: String(row.role || 'VIEWER') as InvitationRole,
      status: String(row.status || 'PENDING') as TenantInvitation['status'],
      expiresAt: String(row.expiresAt || ''),
      acceptedAt: row.acceptedAt ? String(row.acceptedAt) : null,
      createdAt: String(row.createdAt || ''),
    }];
  });
}

function statusLabel(status: TenantInvitation['status']): string {
  if (status === 'PENDING') return 'Pendiente';
  if (status === 'ACCEPTED') return 'Aceptada';
  if (status === 'REVOKED') return 'Revocada';
  return 'Vencida';
}

function recipientLabel(invitation: Pick<TenantInvitation, 'email' | 'phone'>): string {
  return invitation.email || invitation.phone || 'Destinatario sin identificar';
}

export function AdminInvitationsPage() {
  const { confirm, showAlert } = useAdminUi();
  const { user } = useAdminAuth();
  const [invitations, setInvitations] = useState<TenantInvitation[]>([]);
  const [email, setEmail] = useState('');
  const [channel, setChannel] = useState<'email' | 'phone'>('phone');
  const [role, setRole] = useState<InvitationRole>('SELLER');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/invitations', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String(payload?.message || 'No se pudieron cargar las invitaciones.'), 'error');
        return;
      }
      setInvitations(invitationList(payload));
    } catch {
      showAlert('No se pudieron cargar las invitaciones.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: channel === 'email' ? email : null,
          phone: channel === 'phone' ? email : null,
          role,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(String(payload?.message || 'No se pudo enviar la invitaci\u00f3n.'), 'error');
        return;
      }
      setEmail('');
      showAlert(payload?.invitation?.resent ? 'Invitaci\u00f3n reenviada.' : 'Invitaci\u00f3n enviada.', 'success');
      await load();
    } catch {
      showAlert('No se pudo enviar la invitaci\u00f3n.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(invitation: TenantInvitation) {
    const accepted = await confirm({
      title: 'Revocar invitaci\u00f3n',
      message: `La invitaci\u00f3n de ${recipientLabel(invitation)} dejar\u00e1 de funcionar.`,
      acceptText: 'Revocar',
    });
    if (!accepted) return;
    const response = await fetch(`/api/admin/invitations/${encodeURIComponent(invitation.id)}`, {
      method: 'DELETE',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      showAlert(String(payload?.message || 'No se pudo revocar la invitaci\u00f3n.'), 'error');
      return;
    }
    showAlert('Invitaci\u00f3n revocada.', 'success');
    await load();
  }

  return (
    <section className="admin-page-stack tenant-invitations-page-next">
      <header className="admin-page-header">
        <div>
          <p className="admin-page-eyebrow">Accesos</p>
          <h1>Invitaciones</h1>
          <p>Los colaboradores reciben un enlace por correo o WhatsApp y definen su propia contrase&ntilde;a.</p>
        </div>
      </header>

      <article className="admin-card">
        <h2>Invitar colaborador</h2>
        <form className="tenant-invitation-form-next" onSubmit={submit}>
          <fieldset className="auth-channel-fieldset-next">
            <legend>Canal de invitaci&oacute;n</legend>
            <div className="auth-channel-options-next" role="radiogroup" aria-label="Canal de invitación">
              <label className={`auth-channel-option-next${channel === 'email' ? ' is-selected' : ''}`}>
                <input type="radio" name="invitationChannel" value="email" checked={channel === 'email'} onChange={() => setChannel('email')} />
                <span className="auth-channel-option-content-next">
                  <strong>Correo</strong>
                  <small>Envía la invitación por email</small>
                </span>
              </label>
              <label className={`auth-channel-option-next${channel === 'phone' ? ' is-selected' : ''}`}>
                <input type="radio" name="invitationChannel" value="phone" checked={channel === 'phone'} onChange={() => setChannel('phone')} />
                <span className="auth-channel-option-content-next">
                  <strong>WhatsApp</strong>
                  <small>Envía la invitación al celular</small>
                </span>
              </label>
            </div>
          </fieldset>
          <label>
            {channel === 'email' ? 'Correo' : 'Número de WhatsApp'}
            <input
              type={channel === 'email' ? 'email' : 'tel'}
              inputMode={channel === 'email' ? 'email' : 'numeric'}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={channel === 'email' ? 'persona@empresa.com' : '987654321'}
              autoComplete={channel === 'email' ? 'email' : 'tel-national'}
              maxLength={channel === 'email' ? 320 : 9}
              pattern={channel === 'phone' ? '9[0-9]{8}' : undefined}
              required
            />
          </label>
          <label>
            Rol
            <AdminSelect
              value={role}
              options={INVITATION_ROLE_OPTIONS.filter((option) => (
                option.value !== 'ADMIN' || user?.membership.role === 'OWNER'
              ))}
              onChange={setRole}
              ariaLabel="Rol de la invitacion"
            />
          </label>
          <button type="submit" className="admin-primary-btn" disabled={submitting}>
            {submitting ? 'Enviando...' : 'Enviar invitaci\u00f3n'}
          </button>
        </form>
      </article>

      <article className="admin-card">
        <div className="admin-card-heading-row">
          <div>
            <h2>Historial</h2>
            <p>Una invitaci&oacute;n pendiente puede reenviarse o revocarse.</p>
          </div>
          <button type="button" className="admin-ghost-btn" onClick={() => void load()} disabled={loading}>
            Actualizar
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table list-cards-next">
            <thead>
              <tr>
                <th>Destinatario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Vence</th>
                <th>Acci&oacute;n</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}>Cargando invitaciones...</td></tr>
              ) : invitations.length === 0 ? (
                <tr>
                  <AdminTableEmptyState
                    colSpan={5}
                    title="Aun no hay invitaciones"
                    description="Las invitaciones enviadas al equipo apareceran aqui."
                  />
                </tr>
              ) : invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td data-label="Destinatario">{recipientLabel(invitation)}</td>
                  <td data-label="Rol">{invitation.role}</td>
                  <td data-label="Estado">
                    <span className={`admin-status-badge ${invitation.status === 'ACCEPTED' ? 'success' : invitation.status === 'PENDING' ? 'info' : 'error'}`}>
                      {statusLabel(invitation.status)}
                    </span>
                  </td>
                  <td data-label="Vence">{new Date(invitation.expiresAt).toLocaleString('es-PE')}</td>
                  <td data-label="Accion">
                    {invitation.status === 'PENDING' ? (
                      <button type="button" className="admin-ghost-btn" onClick={() => void revoke(invitation)}>
                        Revocar
                      </button>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
