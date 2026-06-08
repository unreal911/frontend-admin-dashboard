'use client';

import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

export interface AdminSelectOption<TValue extends string = string> {
  value: TValue;
  label: string;
  disabled?: boolean;
}

interface AdminSelectProps<TValue extends string = string> {
  value: TValue;
  options: AdminSelectOption<TValue>[];
  onChange: (value: TValue) => void;
  ariaLabel: string;
  disabled?: boolean;
}

export function AdminSelect<TValue extends string = string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
}: AdminSelectProps<TValue>) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const selectedOption = useMemo(() => {
    return options.find((option) => option.value === value) || options[0] || null;
  }, [options, value]);

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
      setOpen(true);
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`admin-select-next ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="admin-select-trigger-next"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onButtonKeyDown}
      >
        <span>{selectedOption?.label || ''}</span>
      </button>

      {open ? (
        <div id={`${id}-listbox`} className="admin-select-list-next" role="listbox" aria-label={ariaLabel}>
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
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
