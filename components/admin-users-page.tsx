'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminSelect, AdminSelectOption } from '@/components/admin-select';
import { useAdminUi } from '@/components/admin-ui-provider';
import { validatePasswordConfirmation } from '@/lib/password-confirmation';

interface AdminRole {
  id: number;
  name: string;
  isActive?: boolean;
}

interface AdminUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  role: {
    id: number;
    name: string;
  };
}

interface UserFormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  roleId: number;
  isActive: boolean;
}

const DEFAULT_FORM: UserFormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  roleId: 0,
  isActive: true,
};

const USER_STATUS_OPTIONS: AdminSelectOption<'true' | 'false'>[] = [
  { value: 'true', label: 'Activo' },
  { value: 'false', label: 'Inactivo' },
];

function normalizeRoles(payload: unknown): AdminRole[] {
  const items = Array.isArray(payload)
    ? payload
    : (Array.isArray((payload as { data?: unknown[] } | null)?.data) ? (payload as { data: unknown[] }).data : []);

  const normalized: AdminRole[] = [];
  for (const item of items) {
    const role = item as Partial<AdminRole>;
    const id = Number(role.id);
    const name = String(role.name || '').trim();
    if (!Number.isInteger(id) || id < 1 || !name) {
      continue;
    }
    normalized.push({
      id,
      name,
      isActive: role.isActive,
    });
  }
  return normalized;
}

function normalizeUsers(payload: unknown): AdminUser[] {
  const items = Array.isArray(payload)
    ? payload
    : (Array.isArray((payload as { data?: unknown[] } | null)?.data) ? (payload as { data: unknown[] }).data : []);

  const normalized: AdminUser[] = [];
  for (const item of items) {
    const user = item as Partial<AdminUser>;
    const id = Number(user.id);
    const firstName = String(user.firstName || '').trim();
    const lastName = String(user.lastName || '').trim();
    const email = String(user.email || '').trim();
    const roleId = Number(user.role?.id);
    const roleName = String(user.role?.name || '').trim();

    if (
      !Number.isInteger(id)
      || id < 1
      || !firstName
      || !lastName
      || !email
      || !Number.isInteger(roleId)
      || roleId < 1
      || !roleName
    ) {
      continue;
    }

    normalized.push({
      id,
      firstName,
      lastName,
      email,
      isActive: Boolean(user.isActive),
      role: {
        id: roleId,
        name: roleName,
      },
    });
  }

  return normalized;
}

function getCurrentUserId(payload: unknown): number | null {
  const id = Number((payload as { user?: { id?: unknown } } | null)?.user?.id);
  if (!Number.isInteger(id) || id < 1) {
    return null;
  }
  return id;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function AdminUsersPage() {
  const { confirm, showAlert } = useAdminUi();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [, setIsLoadingRoles] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchText, setSearchText] = useState('');
  const [activeChecked, setActiveChecked] = useState(true);
  const [inactiveChecked, setInactiveChecked] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<UserFormState>(DEFAULT_FORM);
  const [modalError, setModalError] = useState('');

  const filteredUsers = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch = !search
        || user.firstName.toLowerCase().includes(search)
        || user.lastName.toLowerCase().includes(search)
        || user.email.toLowerCase().includes(search);

      const userActive = user.isActive;
      const matchesStatus = (activeChecked && userActive) || (inactiveChecked && !userActive);
      return matchesSearch && matchesStatus;
    });
  }, [users, searchText, activeChecked, inactiveChecked]);

  async function loadUsers() {
    setIsLoadingUsers(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudieron cargar usuarios.'),
          'error',
        );
        setUsers([]);
        return;
      }

      setUsers(normalizeUsers(payload));
    } catch {
      showAlert('No se pudieron cargar usuarios.', 'error');
      setUsers([]);
    } finally {
      setIsLoadingUsers(false);
    }
  }

  async function loadRoles() {
    setIsLoadingRoles(true);
    try {
      const response = await fetch('/api/admin/roles', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudieron cargar roles.'),
          'error',
        );
        setRoles([]);
        return;
      }

      setRoles(normalizeRoles(payload));
    } catch {
      showAlert('No se pudieron cargar roles.', 'error');
      setRoles([]);
    } finally {
      setIsLoadingRoles(false);
    }
  }

  async function loadCurrentUser() {
    const response = await fetch('/api/admin/auth/me', {
      method: 'GET',
      cache: 'no-store',
    }).catch(() => null);

    if (!response) {
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return;
    }
    setCurrentUserId(getCurrentUserId(payload));
  }

  useEffect(() => {
    loadUsers();
    loadRoles();
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isMutating) {
        closeModal();
      }
    }

    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
    };
  }, [modalOpen, isMutating]);

  function openEditModal(user: AdminUser) {
    setEditingUser(user);
    setForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      password: '',
      confirmPassword: '',
      roleId: user.role.id,
      isActive: user.isActive,
    });
    setModalError('');
    setModalOpen(true);
  }

  function closeModal() {
    if (isMutating) {
      return;
    }
    setModalOpen(false);
    setEditingUser(null);
    setModalError('');
    setForm(DEFAULT_FORM);
  }

  function validateForm(): string | null {
    if (form.firstName.trim().length < 2) {
      return 'El nombre debe tener al menos 2 caracteres.';
    }
    if (form.lastName.trim().length < 2) {
      return 'El apellido debe tener al menos 2 caracteres.';
    }
    if (!isValidEmail(form.email)) {
      return 'Ingresa un correo valido.';
    }
    if (!Number.isInteger(form.roleId) || form.roleId < 1) {
      return 'Selecciona un rol valido.';
    }
    if (!editingUser && form.password.trim().length < 6) {
      return 'La contrasena debe tener minimo 6 caracteres.';
    }
    if (!editingUser) {
      const passwordConfirmationError = validatePasswordConfirmation(
        form.password.trim(),
        form.confirmPassword.trim(),
      );
      if (passwordConfirmationError) {
        return passwordConfirmationError;
      }
    }
    return null;
  }

  async function saveUser() {
    if (isMutating) {
      return;
    }

    const validationMessage = validateForm();
    if (validationMessage) {
      setModalError(validationMessage);
      return;
    }

    setModalError('');
    setIsMutating(true);
    try {
      const isEditing = Boolean(editingUser);
      const endpoint = isEditing ? `/api/admin/users/${editingUser?.id}` : '/api/admin/users';
      const method = isEditing ? 'PUT' : 'POST';
      const payload: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        roleId: form.roleId,
        isActive: form.isActive,
      };
      if (!isEditing) {
        payload.password = form.password.trim();
      }

      const response = await fetch(endpoint, {
        method,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = String(
          (responsePayload as { message?: unknown } | null)?.message
          || `No se pudo ${isEditing ? 'actualizar' : 'crear'} el usuario.`,
        );
        setModalError(message);
        return;
      }

      await loadUsers();
      showAlert(`Usuario ${isEditing ? 'actualizado' : 'creado'} correctamente.`, 'success');
      closeModal();
    } catch {
      setModalError(`No se pudo ${editingUser ? 'actualizar' : 'crear'} el usuario.`);
    } finally {
      setIsMutating(false);
    }
  }

  async function deleteUser(user: AdminUser) {
    if (isMutating) {
      return;
    }

    const accepted = await confirm({
      title: 'Eliminar usuario',
      message: `Deseas eliminar a ${user.firstName} ${user.lastName}?`,
      acceptText: 'Eliminar',
      cancelText: 'Cancelar',
    });
    if (!accepted) {
      return;
    }

    setIsMutating(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudo eliminar el usuario.'),
          'error',
        );
        return;
      }

      await loadUsers();
      showAlert('Usuario eliminado correctamente.', 'success');
    } catch {
      showAlert('No se pudo eliminar el usuario.', 'error');
    } finally {
      setIsMutating(false);
    }
  }

  function applySearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setSearchText(searchDraft.trim());
  }

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card">
        <p className="section-kicker">Admin Dashboard</p>
        <h1 className="section-title">Gestion de usuarios</h1>
        <p className="section-subtitle">Controla cuentas, roles asignados y estado de acceso.</p>
      </article>

      <article className="admin-card admin-filters-card-next">
        <fieldset className="admin-filters-fieldset-next">
          <legend className="admin-filters-legend-next">Filtros</legend>
          <form className="admin-filters-layout-next" onSubmit={applySearch}>
            <div className="admin-toolbar-join-next">
              <input
                type="text"
                placeholder="Buscar por nombre o correo"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
              />
              <button type="submit" className="admin-primary-btn" disabled={isLoadingUsers}>
                Buscar
              </button>
            </div>
            <div className="admin-toolbar-checks-next">
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={activeChecked}
                  onChange={(event) => setActiveChecked(event.target.checked)}
                />
                Activos
              </label>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={inactiveChecked}
                  onChange={(event) => setInactiveChecked(event.target.checked)}
                />
                Inactivos
              </label>
            </div>
            <div className="admin-filters-actions-next">
              <button type="button" className="admin-ghost-btn" onClick={loadUsers} disabled={isLoadingUsers}>
                Actualizar
              </button>
              <Link className="admin-primary-btn" href="/admin/invitations">
                Invitar usuario
              </Link>
            </div>
          </form>
        </fieldset>

        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table list-cards-next">
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingUsers ? (
                <tr>
                  <td colSpan={6} data-label="Estado">Cargando usuarios...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} data-label="Estado">No hay usuarios para mostrar.</td>
                </tr>
              ) : (
                filteredUsers.map((user, index) => (
                  <tr key={user.id}>
                    <td data-label="#">{index + 1}</td>
                    <td data-label="Nombre" className="list-card-title-next">{user.firstName} {user.lastName}</td>
                    <td data-label="Correo">{user.email}</td>
                    <td data-label="Rol">
                      <span className="admin-status-badge info">{user.role.name}</span>
                    </td>
                    <td data-label="Estado">
                      <span className={`admin-status-badge ${user.isActive ? 'success' : 'error'}`}>
                        {user.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td data-label="Accion">
                      <div className="admin-table-actions">
                        <button type="button" className="admin-ghost-btn" onClick={() => openEditModal(user)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="admin-ghost-btn"
                          onClick={() => deleteUser(user)}
                          disabled={isMutating || currentUserId === user.id}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {modalOpen ? (
        <div className="admin-modal-overlay" role="presentation" onClick={closeModal}>
          <article className="admin-modal-dialog admin-user-modal-dialog" onClick={(event) => event.stopPropagation()}>
            <header className="admin-modal-head-next">
              <div>
                <h3>{editingUser ? 'Editar usuario' : 'Crear nuevo usuario'}</h3>
                <p>{editingUser ? 'Actualiza los datos del usuario.' : 'Agrega un nuevo usuario al sistema.'}</p>
              </div>
              <button
                type="button"
                className="admin-modal-close-next"
                onClick={closeModal}
                disabled={isMutating}
                aria-label="Cerrar modal de usuario"
              >
                x
              </button>
            </header>

            <form
              className="admin-modal-form"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                saveUser();
              }}
            >
              <div className="admin-user-form-grid">
                <label>
                  <span>Nombre</span>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
                    placeholder="Ingresa el nombre"
                  />
                </label>

                <label>
                  <span>Apellido</span>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
                    placeholder="Ingresa el apellido"
                  />
                </label>
              </div>

              <label>
                <span>Correo electronico</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="usuario@ejemplo.com"
                />
              </label>

              {!editingUser ? (
                <div className="admin-user-form-grid">
                  <label>
                    <span>Contrasena</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="Minimo 6 caracteres"
                    />
                  </label>
                  <label>
                    <span>Repetir contrasena</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={form.confirmPassword}
                      onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                      placeholder="Repite la contrasena"
                    />
                  </label>
                </div>
              ) : null}

              <div className="admin-user-form-grid">
                <div className="admin-field-block">
                  <span>Rol</span>
                  <AdminSelect
                    value={String(form.roleId || '')}
                    options={[
                      { value: '', label: 'Selecciona un rol', disabled: true },
                      ...roles.map((role) => ({ value: String(role.id), label: role.name })),
                    ]}
                    ariaLabel="Seleccionar rol de usuario"
                    onChange={(nextValue) => setForm((current) => ({ ...current, roleId: Number(nextValue) }))}
                  />
                </div>

                <div className="admin-field-block">
                  <span>Estado</span>
                  <AdminSelect
                    value={form.isActive ? 'true' : 'false'}
                    options={USER_STATUS_OPTIONS}
                    ariaLabel="Seleccionar estado de usuario"
                    onChange={(nextValue) => setForm((current) => ({ ...current, isActive: nextValue === 'true' }))}
                  />
                </div>
              </div>

              {modalError ? <p className="admin-modal-error">{modalError}</p> : null}

              <div className="admin-modal-actions">
                <button type="button" className="admin-ghost-btn" onClick={closeModal} disabled={isMutating}>
                  Cancelar
                </button>
                <button type="submit" className="admin-primary-btn" disabled={isMutating}>
                  {isMutating ? 'Guardando...' : (editingUser ? 'Actualizar usuario' : 'Crear usuario')}
                </button>
              </div>
            </form>
          </article>
        </div>
      ) : null}
    </section>
  );
}
