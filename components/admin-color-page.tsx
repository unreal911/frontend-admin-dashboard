'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAdminUi } from '@/components/admin-ui-provider';

interface AdminColor {
  id: number;
  name: string;
  isActive: boolean;
  hex?: string | null;
}

interface ColorsResponse {
  data?: AdminColor[];
}

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function parseHex(value: unknown): string | null {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }
  return HEX_COLOR_PATTERN.test(text) ? text.toUpperCase() : null;
}

function normalizeHexInput(value: string): string {
  const text = value.trim();
  if (!text) {
    return '';
  }
  const withHash = text.startsWith('#') ? text : `#${text}`;
  return withHash.toUpperCase();
}

function toColorInputValue(value: string): string {
  const hex = parseHex(value);
  if (!hex) {
    return '#000000';
  }
  if (hex.length === 4) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return hex;
}

function normalizeColorsResponse(payload: unknown): AdminColor[] {
  const data = (payload as ColorsResponse | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }

  const normalized: AdminColor[] = [];
  for (const item of data) {
    const id = Number((item as AdminColor).id);
    const name = String((item as AdminColor).name || '').trim();
    const isActive = Boolean((item as AdminColor).isActive);
    if (!Number.isInteger(id) || id < 1 || !name) {
      continue;
    }
    normalized.push({
      id,
      name,
      isActive,
      hex: parseHex((item as AdminColor).hex),
    });
  }
  return normalized;
}

export function AdminColorPage() {
  const { confirm, showAlert } = useAdminUi();
  const [colors, setColors] = useState<AdminColor[]>([]);
  const [search, setSearch] = useState('');
  const [showActive, setShowActive] = useState(true);
  const [showInactive, setShowInactive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingColor, setEditingColor] = useState<AdminColor | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalHex, setModalHex] = useState('');
  const [modalSubmitted, setModalSubmitted] = useState(false);

  async function loadColors() {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/colors?skip=1&take=200', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudieron cargar colores.'),
          'error',
        );
        setColors([]);
        return;
      }
      setColors(normalizeColorsResponse(payload));
    } catch {
      showAlert('No se pudo consultar colores.', 'error');
      setColors([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadColors();
  }, []);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return colors.filter((color) => {
      const matchesSearch = !normalizedSearch || color.name.toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        (showActive && color.isActive) ||
        (showInactive && !color.isActive) ||
        (!showActive && !showInactive);
      return matchesSearch && matchesStatus;
    });
  }, [colors, search, showActive, showInactive]);

  function openCreateModal() {
    setEditingColor(null);
    setModalMode('create');
    setModalName('');
    setModalHex('');
    setModalSubmitted(false);
    setModalOpen(true);
  }

  function openEditModal(color: AdminColor) {
    setEditingColor(color);
    setModalMode('edit');
    setModalName(color.name);
    setModalHex(color.hex || '');
    setModalSubmitted(false);
    setModalOpen(true);
  }

  function closeModal() {
    if (isMutating) {
      return;
    }
    setModalOpen(false);
    setEditingColor(null);
    setModalName('');
    setModalHex('');
    setModalSubmitted(false);
  }

  async function saveColor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalSubmitted(true);

    const normalizedName = modalName.trim();
    if (!normalizedName) {
      return;
    }

    const normalizedHex = normalizeHexInput(modalHex);
    if (normalizedHex && !HEX_COLOR_PATTERN.test(normalizedHex)) {
      return;
    }

    setIsMutating(true);
    try {
      const endpoint = modalMode === 'create'
        ? '/api/admin/colors'
        : `/api/admin/colors/${editingColor?.id}`;
      const method = modalMode === 'create' ? 'POST' : 'PUT';
      const requestPayload: Record<string, unknown> = { name: normalizedName };
      if (normalizedHex) {
        requestPayload.hex = normalizedHex;
      } else if (modalMode === 'edit') {
        requestPayload.hex = null;
      }

      const response = await fetch(endpoint, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String(
            (payload as { message?: unknown } | null)?.message
            || `No se pudo ${modalMode === 'create' ? 'crear' : 'actualizar'} el color.`,
          ),
          'error',
        );
        return;
      }

      await loadColors();
      setModalOpen(false);
      setEditingColor(null);
      setModalName('');
      setModalHex('');
      setModalSubmitted(false);
      showAlert(
        `Color "${normalizedName}" ${modalMode === 'create' ? 'creado' : 'actualizado'}.`,
        'success',
      );
    } catch {
      showAlert(
        `No se pudo ${modalMode === 'create' ? 'crear' : 'actualizar'} el color.`,
        'error',
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function toggleColor(color: AdminColor) {
    const nextActive = !color.isActive;
    const confirmed = await confirm({
      title: nextActive ? 'Activar color' : 'Desactivar color',
      message: nextActive
        ? `Deseas activar el color "${color.name}"?`
        : `Deseas desactivar el color "${color.name}"?`,
      acceptText: nextActive ? 'Activar' : 'Desactivar',
      cancelText: 'Cancelar',
    });

    if (!confirmed) {
      return;
    }

    setIsMutating(true);
    try {
      const response = await fetch(`/api/admin/colors/${color.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        showAlert(
          String((payload as { message?: unknown } | null)?.message || 'No se pudo actualizar el estado.'),
          'error',
        );
        return;
      }

      setColors((current) =>
        current.map((item) => (item.id === color.id ? { ...item, isActive: nextActive } : item)),
      );
      showAlert(`Color "${color.name}" ${nextActive ? 'activado' : 'desactivado'}.`, 'success');
    } catch {
      showAlert('No se pudo actualizar el estado del color.', 'error');
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <section className="admin-dashboard-grid">
      <article className="admin-card admin-filters-card-next">
        <fieldset className="admin-filters-fieldset-next">
          <legend className="admin-filters-legend-next">Settings</legend>
          <div className="admin-filters-layout-next">
            <div className="admin-toolbar-join-next">
              <input
                type="text"
                placeholder="Buscar por nombre"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="admin-toolbar-checks-next">
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={showActive}
                  onChange={(event) => setShowActive(event.target.checked)}
                />
                Activos
              </label>
              <label className="admin-checkbox">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(event) => setShowInactive(event.target.checked)}
                />
                Inactivos
              </label>
            </div>
            <div className="admin-filters-actions-next">
              <button type="button" className="admin-primary-btn" onClick={openCreateModal} disabled={isMutating}>
                Agregar
              </button>
            </div>
          </div>
        </fieldset>

        <div className="admin-table-wrap">
          <table className="admin-table mobile-card-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Muestra</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} data-label="Estado">
                    Cargando colores...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} data-label="Estado">
                    No hay colores para mostrar.
                  </td>
                </tr>
              ) : (
                filtered.map((color, index) => (
                  <tr key={color.id}>
                    <td data-label="#">{index + 1}</td>
                    <td data-label="Nombre">{color.name}</td>
                    <td data-label="Muestra">
                      {color.hex ? (
                        <span className="admin-color-swatch-wrap">
                          <i className="admin-color-swatch" style={{ backgroundColor: color.hex }} />
                          <span>{color.hex}</span>
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td data-label="Estado">
                      <span className={`admin-pill ${color.isActive ? 'success' : 'error'}`}>
                        {color.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td data-label="Accion">
                      <div className="admin-table-actions">
                        <button type="button" className="admin-ghost-btn" onClick={() => openEditModal(color)}>
                          Editar
                        </button>
                        <button type="button" className="admin-ghost-btn" onClick={() => toggleColor(color)}>
                          {color.isActive ? 'Desactivar' : 'Activar'}
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
          <div
            className="admin-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-color-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-modal-head-next">
              <div>
                <h3 id="admin-color-modal-title">{modalMode === 'create' ? 'Crear nuevo color' : 'Editar color'}</h3>
                <p>
                  {modalMode === 'create'
                    ? 'Agrega un color al catalogo con su codigo hexadecimal.'
                    : 'Modifica el nombre y la muestra hexadecimal del color.'}
                </p>
              </div>
              <button
                type="button"
                className="admin-modal-close-next"
                onClick={closeModal}
                disabled={isMutating}
                aria-label="Cerrar modal"
              >
                x
              </button>
            </div>

            <form className="admin-modal-form" onSubmit={saveColor}>
              <label>
                <span>Nombre del color</span>
                <input
                  type="text"
                  placeholder="Ingresa el nombre..."
                  value={modalName}
                  onChange={(event) => setModalName(event.target.value)}
                  autoFocus
                />
              </label>
              {modalSubmitted && !modalName.trim() ? (
                <p className="admin-modal-error">El nombre es requerido.</p>
              ) : null}

              <div className="admin-color-hex-grid-next">
                <label>
                  <span>Hexadecimal</span>
                  <input
                    type="text"
                    placeholder="#1D4ED8"
                    value={modalHex}
                    onChange={(event) => setModalHex(normalizeHexInput(event.target.value))}
                    maxLength={7}
                    inputMode="text"
                  />
                </label>
                <label>
                  <span>Selector</span>
                  <input
                    type="color"
                    value={toColorInputValue(modalHex)}
                    onChange={(event) => setModalHex(event.target.value.toUpperCase())}
                    className="admin-color-picker-input-next"
                    aria-label="Seleccionar color hexadecimal"
                  />
                </label>
              </div>

              <div className="admin-color-preview-next">
                <i
                  className="admin-color-swatch"
                  style={{ backgroundColor: parseHex(modalHex) || '#CBD5E1' }}
                  aria-hidden="true"
                />
                <span>{parseHex(modalHex) || 'Sin hexadecimal'}</span>
              </div>

              {modalSubmitted && modalHex.trim() && !parseHex(modalHex) ? (
                <p className="admin-modal-error">Usa un formato valido, por ejemplo #1D4ED8.</p>
              ) : null}

              <div className="admin-modal-actions">
                <button type="button" className="admin-ghost-btn" onClick={closeModal} disabled={isMutating}>
                  Cancelar
                </button>
                <button type="submit" className="admin-primary-btn" disabled={isMutating}>
                  {isMutating ? 'Guardando...' : modalMode === 'edit' ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
