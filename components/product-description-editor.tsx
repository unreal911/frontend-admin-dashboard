'use client';

// Editor rich-text de la descripcion del producto (extraido de admin-product-modal.tsx).
// Uncontrolled contentEditable: el padre mantiene el HTML en `value` y recibe cambios via `onChange`.
// El DOM se sincroniza desde `value` solo al montar o cuando `value` cambia por fuera (reset del
// formulario / carga de producto), NO durante la escritura del usuario (rastreado con lastEmittedRef).

import { useEffect, useRef } from 'react';
import { looksLikeHtml, sanitizeDescriptionHtml } from '@/lib/product-form-utils';

interface ProductDescriptionEditorProps {
  value: string;
  onChange: (html: string) => void;
}

export function ProductDescriptionEditor({ value, onChange }: ProductDescriptionEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedRef = useRef<string | null>(null);

  // Sincroniza el DOM desde `value` cuando cambia por fuera (no por input propio).
  useEffect(() => {
    if (value === lastEmittedRef.current) {
      return;
    }
    lastEmittedRef.current = value;
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    if (!value) {
      editor.innerHTML = '';
      return;
    }
    if (looksLikeHtml(value)) {
      editor.innerHTML = sanitizeDescriptionHtml(value);
      return;
    }
    editor.textContent = value;
  }, [value]);

  function emitFromDom() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const text = String(editor.textContent || '').trim();
    const html = text ? sanitizeDescriptionHtml(editor.innerHTML) : '';
    lastEmittedRef.current = html;
    onChange(html);
  }

  function focusEditor() {
    editorRef.current?.focus();
  }

  function applyCommand(command: string, value?: string) {
    focusEditor();
    document.execCommand(command, false, value);
    emitFromDom();
  }

  function setBlock(tagName: 'p' | 'h2' | 'h3' | 'blockquote') {
    applyCommand('formatBlock', tagName);
  }

  function setFont(fontName: string) {
    if (!fontName) {
      return;
    }
    applyCommand('fontName', fontName);
  }

  function setColor(color: string) {
    if (!color) {
      return;
    }
    applyCommand('foreColor', color);
  }

  function setFontSize(size: string) {
    if (!size) {
      return;
    }
    applyCommand('fontSize', size);
  }

  function insertGrid() {
    const tableHtml = `
      <table style="width:100%; border-collapse: collapse; margin: 0.5rem 0;">
        <tbody>
          <tr>
            <td style="border:1px solid #94a3b8; padding:6px;">Celda 1</td>
            <td style="border:1px solid #94a3b8; padding:6px;">Celda 2</td>
          </tr>
          <tr>
            <td style="border:1px solid #94a3b8; padding:6px;">Celda 3</td>
            <td style="border:1px solid #94a3b8; padding:6px;">Celda 4</td>
          </tr>
        </tbody>
      </table>
    `;
    applyCommand('insertHTML', tableHtml);
  }

  function clearFormat() {
    applyCommand('removeFormat');
  }

  return (
    <div className="description-editor-shell">
      <div className="description-toolbar">
        <select
          defaultValue=""
          onChange={(event) => {
            const nextValue = event.target.value;
            if (nextValue) {
              setBlock(nextValue as 'p' | 'h2' | 'h3' | 'blockquote');
            }
            event.currentTarget.value = '';
          }}
        >
          <option value="">Bloque</option>
          <option value="p">Parrafo</option>
          <option value="h2">Titulo H2</option>
          <option value="h3">Titulo H3</option>
          <option value="blockquote">Cita</option>
        </select>

        <select
          defaultValue=""
          onChange={(event) => {
            setFont(event.target.value);
            event.currentTarget.value = '';
          }}
        >
          <option value="">Fuente</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Courier New">Courier</option>
          <option value="Tahoma">Tahoma</option>
        </select>

        <select
          defaultValue=""
          onChange={(event) => {
            setFontSize(event.target.value);
            event.currentTarget.value = '';
          }}
        >
          <option value="">Tamano</option>
          <option value="2">Pequeno</option>
          <option value="3">Normal</option>
          <option value="5">Grande</option>
        </select>

        <input type="color" className="color-picker" onChange={(event) => setColor(event.target.value)} />

        <button type="button" className="admin-ghost-btn" onClick={() => applyCommand('bold')}>
          <b>B</b>
        </button>
        <button type="button" className="admin-ghost-btn" onClick={() => applyCommand('italic')}>
          <i>I</i>
        </button>
        <button type="button" className="admin-ghost-btn" onClick={() => applyCommand('underline')}>
          <u>U</u>
        </button>
        <button type="button" className="admin-ghost-btn" onClick={() => applyCommand('insertUnorderedList')}>
          Lista
        </button>
        <button type="button" className="admin-ghost-btn" onClick={() => applyCommand('insertOrderedList')}>
          Numerada
        </button>
        <button type="button" className="admin-ghost-btn" onClick={() => applyCommand('justifyLeft')}>
          Izq
        </button>
        <button type="button" className="admin-ghost-btn" onClick={() => applyCommand('justifyCenter')}>
          Centro
        </button>
        <button type="button" className="admin-ghost-btn" onClick={() => applyCommand('justifyRight')}>
          Der
        </button>
        <button type="button" className="admin-ghost-btn" onClick={insertGrid}>
          Grilla
        </button>
        <button type="button" className="admin-ghost-btn" onClick={clearFormat}>
          Limpiar
        </button>
      </div>

      <div
        ref={editorRef}
        className="description-editor-area"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Descripcion con formato (fuente, tablas, listas...)"
        onInput={emitFromDom}
        onBlur={emitFromDom}
      />
    </div>
  );
}
