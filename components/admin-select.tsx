'use client';

import { KeyboardEvent, Ref, useEffect, useId, useMemo, useRef, useState } from 'react';

export interface AdminSelectOption<TValue extends string = string> {
  value: TValue;
  label: string;
  description?: string;
  meta?: string;
  disabled?: boolean;
}

interface AdminSelectProps<TValue extends string = string> {
  value: TValue;
  options: AdminSelectOption<TValue>[];
  onChange: (value: TValue) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** Ref al botón disparador (para focus/scrollIntoView en validación). */
  buttonRef?: Ref<HTMLButtonElement>;
  /** Marca el control como inválido (borde de error + aria-invalid). */
  invalid?: boolean;
  /** id del elemento que describe el error (aria-describedby). */
  describedBy?: string;
}

export function AdminSelect<TValue extends string = string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  buttonRef,
  invalid = false,
  describedBy,
}: AdminSelectProps<TValue>) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuAlignment, setMenuAlignment] = useState<'left' | 'right'>('left');

  const selectedOption = useMemo(() => {
    return options.find((option) => option.value === value) || options[0] || null;
  }, [options, value]);

  const hasRichSelectedOption = Boolean(selectedOption?.description || selectedOption?.meta);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onDocumentPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown);
  }, [open]);

  function selectOption(option: AdminSelectOption<TValue>) {
    if (option.disabled) {
      return;
    }

    const nextValue = option.value;
    onChange(nextValue);
    setOpen(false);
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      updateMenuAlignment();
      setOpen(true);
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  function updateMenuAlignment() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || typeof window === 'undefined') return;
    const viewportPadding = 12;
    const desiredWidth = Math.min(Math.max(rect.width, 192), window.innerWidth - viewportPadding * 2);
    setMenuAlignment(rect.left + desiredWidth > window.innerWidth - viewportPadding ? 'right' : 'left');
  }

  function toggleMenu() {
    if (!open) updateMenuAlignment();
    setOpen((current) => !current);
  }

  return (
    <div ref={rootRef} className={`admin-select-next ${open ? 'open' : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        className={`admin-select-trigger-next${invalid ? ' admin-field-invalid' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={toggleMenu}
        onKeyDown={onButtonKeyDown}
      >
        <span className={`admin-select-value-next${hasRichSelectedOption ? ' rich' : ''}`}>
          <span className="admin-select-value-label-next">{selectedOption?.label || ''}</span>
          {selectedOption?.description ? (
            <small className="admin-select-value-description-next">{selectedOption.description}</small>
          ) : null}
        </span>
        {selectedOption?.meta ? <span className="admin-select-meta-next">{selectedOption.meta}</span> : null}
      </button>

      {open ? (
        <div
          id={`${id}-listbox`}
          className={`admin-select-list-next align-${menuAlignment}`}
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              className={`admin-select-option-next ${option.value === value ? 'selected' : ''}`}
              onClick={() => selectOption(option)}
            >
              <span className="admin-select-option-copy-next">
                <span className="admin-select-option-label-next">{option.label}</span>
                {option.description ? (
                  <small className="admin-select-option-description-next">{option.description}</small>
                ) : null}
              </span>
              {option.meta ? <span className="admin-select-meta-next">{option.meta}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
