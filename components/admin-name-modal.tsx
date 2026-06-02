'use client';

import { FormEvent, useEffect, useState } from 'react';

interface AdminNameModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  createTitle: string;
  createDescription: string;
  editTitle: string;
  editDescription: string;
  fieldLabel: string;
  fieldPlaceholder: string;
  initialValue?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void> | void;
}

export function AdminNameModal({
  open,
  mode,
  createTitle,
  createDescription,
  editTitle,
  editDescription,
  fieldLabel,
  fieldPlaceholder,
  initialValue = '',
  isSubmitting = false,
  onClose,
  onSubmit,
}: AdminNameModalProps) {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setValue(initialValue);
    setSubmitted(false);
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
    };
  }, [open, isSubmitting, onClose]);

  if (!open) {
    return null;
  }

  const isEditing = mode === 'edit';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    const normalized = value.trim();
    if (!normalized) {
      return;
    }
    await onSubmit(normalized);
  }

  return (
    <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="admin-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-name-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-head-next">
          <div>
            <h3 id="admin-name-modal-title">{isEditing ? editTitle : createTitle}</h3>
            <p>{isEditing ? editDescription : createDescription}</p>
          </div>
          <button
            type="button"
            className="admin-modal-close-next"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Cerrar modal"
          >
            x
          </button>
        </div>

        <form className="admin-modal-form" onSubmit={handleSubmit}>
          <label>
            <span>{fieldLabel}</span>
            <input
              type="text"
              placeholder={fieldPlaceholder}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
            />
          </label>
          {submitted && !value.trim() ? (
            <p className="admin-modal-error">Campo requerido.</p>
          ) : null}

          <div className="admin-modal-actions">
            <button type="button" className="admin-ghost-btn" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="admin-primary-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : isEditing ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
