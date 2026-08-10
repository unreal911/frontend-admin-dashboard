'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AdminSelect, AdminSelectOption } from '@/components/admin-select';
import { useAdminUi } from '@/components/admin-ui-provider';

interface RoleUserLite {
  id: number;
}

interface AdminRole {
  id: number;
  name: string;
  description?: string | null;
  isActive?: boolean;
  createdAt?: string;
  users?: RoleUserLite[];
}

interface PermissionCatalogItem {
  code: string;
  name: string;
  module: string;
  description?: string | null;
  isActive: boolean;
}

interface RolePermissionsResponse {
  roleId: number;
  permissions: string[];
}

interface RoleFormState {
  name: string;
  description: string;
  isActive: boolean;
}

interface PermissionGroup {
  module: string;
  permissions: PermissionCatalogItem[];
}

type RoleStatusFilter = 'all' | 'active' | 'inactive';

const ROLE_STATUS_OPTIONS: AdminSelectOption<RoleStatusFilter>[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
];

const DEFAULT_ROLE_FORM: RoleFormState = {
  name: '',
  description: '',
  isActive: true,
};

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
      description: String(role.description || '').trim() || null,
      isActive: role.isActive !== false,
      createdAt: String(role.createdAt || ''),
      users: Array.isArray(role.users)
        ? role.users.map((user) => ({ id: Number((user as RoleUserLite).id) })).filter((user) => Number.isInteger(user.id) && user.id > 0)
        : [],
    });
  }

  return normalized;
}

function normalizePermissionCatalog(payload: unknown): PermissionCatalogItem[] {
  const items = Array.isArray(payload)
    ? payload
    : (Array.isArray((payload as { data?: unknown[] } | null)?.data) ? (payload as { data: unknown[] }).data : []);

  const normalized: PermissionCatalogItem[] = [];
  for (const item of items) {
    const permission = item as Partial<PermissionCatalogItem>;
    const code = String(permission.code || '').trim().toLowerCase();
    const name = String(permission.name || '').trim();
    const moduleName = String(permission.module || '').trim().toLowerCase();
    if (!code || !name) {
      continue;
    }

    normalized.push({
      code,
      name,
      module: moduleName || 'general',
      description: String(permission.description || '').trim() || null,
      isActive: permission.isActive !== false,
    });
  }

  return normalized;
}

function normalizeRolePermissions(payload: unknown): string[] {
  const response = payload as RolePermissionsResponse | null;
  if (!Array.isArray(response?.permissions)) {
    return [];
  }

  return response.permissions
    .map((permission) => String(permission || '').trim().toLowerCase())
    .filter((permission) => Boolean(permission));
}

function buildPermissionGroups(catalog: PermissionCatalogItem[]): PermissionGroup[] {
  const byModule = new Map<string, PermissionCatalogItem[]>();

  for (const permission of catalog) {
    if (!permission.isActive) {
      continue;
    }
    const moduleName = permission.module || 'general';
    if (!byModule.has(moduleName)) {
      byModule.set(moduleName, []);
    }
    byModule.get(moduleName)?.push(permission);
  }

  return Array.from(byModule.entries())
    .map(([moduleName, permissions]) => ({
      module: moduleName,
      permissions: permissions.slice().sort((a, b) => a.code.localeCompare(b.code)),
    }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

function formatRoleDate(value: string | undefined): string {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short' }).format(date);
}

function normalizeRoleName(value: string): string {
  return value.trim().toUpperCase();
}

export function AdminRolesPage() {
  const { confirm, showAlert } = useAdminUi();

  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [roleForm, setRoleForm] = useState<RoleFormState>(DEFAULT_ROLE_FORM);
  const [roleModalError, setRoleModalError] = useState('');

  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [selectedRoleForPermissions, setSelectedRoleForPermissions] = useState<AdminRole | null>(null);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionCatalogItem[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(false);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);

  const filteredRoles = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    return roles.filter((role) => {
      const matchesName = !term || role.name.toLowerCase().includes(term);
      const active = role.isActive !== false;

      if (statusFilter === 'active') {
        return matchesName && active;
      }
      if (statusFilter === 'inactive') {
        return matchesName && !active;
      }
      return matchesName;
    });
  }, [roles, searchText, statusFilter]);

  async function loadRoles() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchText.trim()) {
        params.set('search', searchText.trim());
      }
      if (statusFilter === 'active') {
        params.set('isActive', 'true');
      } else if (statusFilter === 'inactive') {
        params.set('isActive', 'false');
      }

      const query = params.toString();
      const endpoint = query ? `/api/admin/roles?${query}` : '/api/admin/roles';
      const response = await fetch(endpoint, {
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
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRoles();
  }, []);

  useEffect(() => {
    if (!roleModalOpen && !permissionsModalOpen) {
      return;
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      if (permissionsModalOpen) {
        if (!isSavingPermissions) {
          closePermissionsModal();
        }
        return;
      }

      if (roleModalOpen && !isMutating) {
        closeRoleModal();
      }
    }

    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
    };
  }, [roleModalOpen, permissionsModalOpen, isSavingPermissions, isMutating]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loadRoles();
  }

  function clearFilters() {
    setSearchText('');
    setStatusFilter('all');
    setTimeout(() => loadRoles(), 0);
  }

  function openCreateRoleModal() {
    setEditingRole(null);
    setRoleForm(DEFAULT_ROLE_FORM);
    setRoleModalError('');
    setRoleModalOpen(true);
  }

  function openEditRoleModal(role: AdminRole) {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: String(role.description || ''),
      isActive: role.isActive !== false,
    });
    setRoleModalError('');
    setRoleModalOpen(true);
  }

  function closeRoleModal() {
    if (isMutating) {
      return;
    }
    setRoleModalOpen(false);
    setEditingRole(null);
    setRoleForm(DEFAULT_ROLE_FORM);
    setRoleModalError('');
  }

  async function saveRole(configurePermissionsAfterCreate: boolean) {
    if (isMutating) {
      return;
    }

    const normalizedName = normalizeRoleName(roleForm.name);
    if (!normalizedName) {
      setRoleModalError('El nombre del rol es obligatorio.');
      return;
    }

    setRoleModalError('');
    setIsMutating(true);
    try {
      const payload: { name: string; description?: string; isActive: boolean } = {
        name: normalizedName,
        isActive: roleForm.isActive,
      };
      const description = roleForm.description.trim();
      if (description) {
        payload.description = description;
      }

      const endpoint = editingRole ? `/api/admin/roles/${editingRole.id}` : '/api/admin/roles';
      const method = editingRole ? 'PUT' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => null);
      if (!response.ok) {
        setRoleModalError(
          String(
            (responsePayload as { message?: unknown } | null)?.message
            || `No se pudo ${editingRole ? 'actualizar' : 'crear'} el rol.`,
          ),
        );
        return;
      }

      const savedRole = responsePayload as AdminRole;
      await loadRoles();
      closeRoleModal();
      showAlert('Rol guardado correctamente.', 'success');

      if (!editingRole && configurePermissionsAfterCreate && savedRole?.id) {
        const createdRole: AdminRole = {
          id: Number(savedRole.id),
          name: String(savedRole.name || normalizedName),
          description: String(savedRole.description || ''),
          isActive: savedRole.isActive !== false,
          users: Array.isArray(savedRole.users) ? savedRole.users : [],
        };
        openPermissionsModal(createdRole);
      }
    } catch {
      setRoleModalError(`No se pudo ${editingRole ? 'actualizar' : 'crear'} el rol.`);
    } finally {
      setIsMutating(false);
    }
  }

  async function toggleRoleStatus(role: AdminRole) {
    const nextStatus = role.isActive === false;
    const actionText = nextStatus ? 'activar' : 'desactivar';
    const accepted = await confirm({
      title: `${nextStatus ? 'Activar' : 'Desactivar'} rol`,
      message: `Deseas ${actionText} el rol "${role.name}"?`,
      acceptText: nextStatus ? 'Activar' : 'Desactivar',
      cancelText: 'Cancelar',
    });
    if (!accepted) {
      return;
    }

    setIsMutating(true);
    try {
      const response = await fetch(`/api/admin/roles/${role.id}/status`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ isActive: nextStatus }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || `No se pudo ${actionText} el rol.`),
          'error',
        );
        return;
      }

      await loadRoles();
      showAlert(`Rol ${nextStatus ? 'activado' : 'desactivado'} correctamente.`, 'success');
    } catch {
      showAlert(`No se pudo ${actionText} el rol.`, 'error');
    } finally {
      setIsMutating(false);
    }
  }

  async function openPermissionsModal(role: AdminRole) {
    setPermissionsModalOpen(true);
    setSelectedRoleForPermissions(role);
    setIsPermissionsLoading(true);
    setIsSavingPermissions(false);
    setSelectedPermissions(new Set());
    setPermissionCatalog([]);
    setPermissionGroups([]);

    try {
      const [catalogResponse, rolePermissionsResponse] = await Promise.all([
        fetch('/api/admin/permissions', { method: 'GET', cache: 'no-store' }),
        fetch(`/api/admin/roles/${role.id}/permissions`, { method: 'GET', cache: 'no-store' }),
      ]);

      const catalogPayload = await catalogResponse.json().catch(() => null);
      const rolePermissionsPayload = await rolePermissionsResponse.json().catch(() => null);

      if (!catalogResponse.ok || !rolePermissionsResponse.ok) {
        showAlert(
          String(
            (catalogPayload as { message?: unknown } | null)?.message
            || (rolePermissionsPayload as { message?: unknown } | null)?.message
            || 'No se pudieron cargar permisos.',
          ),
          'error',
        );
        closePermissionsModal(true);
        return;
      }

      const catalog = normalizePermissionCatalog(catalogPayload);
      const assigned = normalizeRolePermissions(rolePermissionsPayload);

      setPermissionCatalog(catalog);
      setPermissionGroups(buildPermissionGroups(catalog));
      setSelectedPermissions(new Set(assigned));
    } catch {
      showAlert('No se pudieron cargar permisos.', 'error');
      closePermissionsModal(true);
    } finally {
      setIsPermissionsLoading(false);
    }
  }

  function closePermissionsModal(force = false) {
    if (!force && isSavingPermissions) {
      return;
    }
    setPermissionsModalOpen(false);
    setSelectedRoleForPermissions(null);
    setPermissionCatalog([]);
    setPermissionGroups([]);
    setSelectedPermissions(new Set());
    setIsPermissionsLoading(false);
    setIsSavingPermissions(false);
  }

  function isPermissionSelected(code: string): boolean {
    return selectedPermissions.has(String(code || '').trim().toLowerCase());
  }

  function togglePermission(code: string, checked: boolean) {
    const normalized = String(code || '').trim().toLowerCase();
    if (!normalized) {
      return;
    }

    setSelectedPermissions((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(normalized);
      } else {
        next.delete(normalized);
      }
      return next;
    });
  }

  async function saveRolePermissions() {
    if (!selectedRoleForPermissions || isSavingPermissions) {
      return;
    }

    setIsSavingPermissions(true);
    try {
      const permissions = Array.from(selectedPermissions.values()).sort((a, b) => a.localeCompare(b));
      const response = await fetch(`/api/admin/roles/${selectedRoleForPermissions.id}/permissions`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ permissions }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudieron guardar permisos.'),
          'error',
        );
        return;
      }

      showAlert('Permisos del rol actualizados correctamente.', 'success');
      closePermissionsModal(true);
      await loadRoles();
    } catch {
      showAlert('No se pudieron guardar permisos.', 'error');
    } finally {
      setIsSavingPermissions(false);
    }
  }

  function getRoleUsersCount(role: AdminRole): number {
    return Array.isArray(role.users) ? role.users.length : 0;
  }

  function getModuleLabel(moduleName: string): string {
    const value = String(moduleName || '').trim();
    if (!value) {
      return 'General';
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card role-header-card">
        <div>
          <p className="section-kicker">Admin Dashboard</p>
          <h1 className="section-title">Gestion de roles</h1>
          <p className="section-subtitle">Consulta los roles operativos predefinidos. Sus permisos se versionan en el backend.</p>
        </div>
        <button type="button" className="admin-primary-btn" onClick={openCreateRoleModal} disabled>
          Roles predefinidos
        </button>
      </article>

      <article className="admin-card admin-filters-card-next">
        <fieldset className="admin-filters-fieldset-next">
          <legend className="admin-filters-legend-next">Filtros</legend>
          <form className="admin-filters-layout-next roles-filters-layout-next" onSubmit={applyFilters}>
            <div className="admin-toolbar-join-next roles-search-join-next">
              <input
                type="text"
                placeholder="Buscar por nombre de rol"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
            </div>
            <div className="roles-status-select-next">
              <AdminSelect
                value={statusFilter}
                options={ROLE_STATUS_OPTIONS}
                ariaLabel="Filtrar roles por estado"
                onChange={setStatusFilter}
              />
            </div>
            <div className="admin-filters-actions-next">
              <button type="submit" className="admin-primary-btn" disabled={isLoading}>
                Filtrar
              </button>
              <button type="button" className="admin-ghost-btn" onClick={clearFilters} disabled={isLoading}>
                Limpiar
              </button>
            </div>
          </form>
        </fieldset>

        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table list-cards-next">
            <thead>
              <tr>
                <th>#</th>
                <th>Rol</th>
                <th>Descripcion</th>
                <th>Estado</th>
                <th>Usuarios</th>
                <th>Creado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} data-label="Estado">Cargando roles...</td>
                </tr>
              ) : filteredRoles.length === 0 ? (
                <tr>
                  <td colSpan={7} data-label="Estado">No hay roles para mostrar.</td>
                </tr>
              ) : (
                filteredRoles.map((role, index) => (
                  <tr key={role.id}>
                    <td data-label="#">{index + 1}</td>
                    <td data-label="Rol" className="list-card-title-next">{role.name}</td>
                    <td data-label="Descripcion">{role.description || '-'}</td>
                    <td data-label="Estado">
                      <span className={`admin-status-badge ${role.isActive !== false ? 'success' : 'warning'}`}>
                        {role.isActive !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td data-label="Usuarios">{getRoleUsersCount(role)}</td>
                    <td data-label="Creado">{formatRoleDate(role.createdAt)}</td>
                    <td data-label="Accion">
                      <div className="admin-table-actions">
                        <button type="button" className="admin-ghost-btn" onClick={() => openEditRoleModal(role)} disabled>
                          Consultar
                        </button>
                        <button type="button" className="admin-ghost-btn" onClick={() => toggleRoleStatus(role)} disabled>
                          {role.isActive === false ? 'Activar' : 'Desactivar'}
                        </button>
                        <button type="button" className="admin-ghost-btn" onClick={() => openPermissionsModal(role)} disabled title="Los permisos de roles predefinidos se administran desde el backend">
                          Permisos
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

      {roleModalOpen ? (
        <div className="admin-modal-overlay" role="presentation" onClick={closeRoleModal}>
          <article className="admin-modal-dialog" onClick={(event) => event.stopPropagation()}>
            <header className="admin-modal-head-next">
              <div>
                <h3>{editingRole ? 'Editar rol' : 'Crear rol'}</h3>
                <p>{editingRole ? 'Actualiza datos del rol.' : 'Crea un rol nuevo para el sistema.'}</p>
              </div>
              <button
                type="button"
                className="admin-modal-close-next"
                onClick={closeRoleModal}
                disabled={isMutating}
                aria-label="Cerrar modal de rol"
              >
                x
              </button>
            </header>

            <form
              className="admin-modal-form"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                saveRole(false);
              }}
            >
              <label>
                <span>Nombre del rol</span>
                <input
                  type="text"
                  maxLength={50}
                  value={roleForm.name}
                  onChange={(event) => setRoleForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ejemplo: WAREHOUSE"
                />
              </label>

              <label>
                <span>Descripcion</span>
                <textarea
                  rows={3}
                  maxLength={180}
                  value={roleForm.description}
                  onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Describe para que sirve este rol"
                />
              </label>

              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={roleForm.isActive}
                  onChange={(event) => setRoleForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                Rol activo
              </label>

              {roleModalError ? <p className="admin-modal-error">{roleModalError}</p> : null}

              <div className="admin-modal-actions">
                {!editingRole ? (
                  <button type="button" className="admin-ghost-btn" onClick={() => saveRole(true)} disabled={isMutating}>
                    {isMutating ? 'Guardando...' : 'Guardar y permisos'}
                  </button>
                ) : null}
                <button type="submit" className="admin-primary-btn" disabled={isMutating}>
                  {isMutating ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" className="admin-ghost-btn" onClick={closeRoleModal} disabled={isMutating}>
                  Cancelar
                </button>
              </div>
            </form>
          </article>
        </div>
      ) : null}

      {permissionsModalOpen ? (
        <div className="admin-modal-overlay" role="presentation" onClick={() => closePermissionsModal()}>
          <article className="admin-modal-dialog admin-permissions-modal-dialog" onClick={(event) => event.stopPropagation()}>
            <header className="admin-modal-head-next">
              <div>
                <h3>Permisos del rol {selectedRoleForPermissions?.name}</h3>
                <p>Configura accesos por modulo y guarda los cambios.</p>
              </div>
              <button
                type="button"
                className="admin-modal-close-next"
                onClick={() => closePermissionsModal()}
                disabled={isSavingPermissions}
                aria-label="Cerrar modal de permisos"
              >
                x
              </button>
            </header>
            {isPermissionsLoading ? (
              <p className="admin-muted-text">Cargando permisos...</p>
            ) : permissionCatalog.length === 0 ? (
              <p className="admin-muted-text">No hay permisos disponibles.</p>
            ) : (
              <div className="admin-permission-grid">
                {permissionGroups.map((group) => (
                  <section key={group.module} className="admin-permission-group">
                    <h4>{getModuleLabel(group.module)}</h4>
                    <div className="admin-permission-list">
                      {group.permissions.map((permission) => (
                        <label key={permission.code} className="admin-permission-item">
                          <input
                            type="checkbox"
                            checked={isPermissionSelected(permission.code)}
                            onChange={(event) => togglePermission(permission.code, event.target.checked)}
                          />
                          <div>
                            <strong>{permission.name}</strong>
                            <p>{permission.description || permission.code}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-primary-btn"
                disabled={isSavingPermissions || isPermissionsLoading}
                onClick={saveRolePermissions}
              >
                {isSavingPermissions ? 'Guardando...' : 'Guardar permisos'}
              </button>
              <button
                type="button"
                className="admin-ghost-btn"
                disabled={isSavingPermissions}
                onClick={() => closePermissionsModal()}
              >
                Cerrar
              </button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
