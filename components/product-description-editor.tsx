'use client';

// Editor rich-text de la descripcion del producto.
// Basado en Tiptap (ProseMirror) — componente externo, reemplaza al editor previo
// que usaba document.execCommand (deprecado).
// Mantiene la misma interfaz: el padre guarda el HTML en `value` y recibe cambios via `onChange`.
// El contenido se re-sincroniza desde `value` solo cuando cambia por fuera (reset del formulario /
// carga de producto), rastreado con lastEmittedRef para no interrumpir la escritura del usuario.

import { useEffect, useRef, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Table,
  TableRow,
  TableHeader,
  TableCell,
} from '@tiptap/extension-table';
import { sanitizeDescriptionHtml } from '@/lib/product-form-utils';

interface ProductDescriptionEditorProps {
  value: string;
  onChange: (html: string) => void;
}

// --- Iconos (SVG stroke, heredan currentColor) --------------------------------
const icon = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);
const IconBulletList = icon(<><line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="4" cy="6" r="1.4" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.4" fill="currentColor" stroke="none" /></>);
const IconOrderedList = icon(<><line x1="10" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="18" x2="20" y2="18" /><path d="M4 4.5h1.4V9M3.4 15.2c0-1 2-1 2 0 0 .8-2 1.4-2 2.6H5.6" strokeWidth="1.6" /></>);
const IconAlignLeft = icon(<><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="18" y2="18" /></>);
const IconAlignCenter = icon(<><line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="5" y1="18" x2="19" y2="18" /></>);
const IconAlignRight = icon(<><line x1="4" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="6" y1="18" x2="20" y2="18" /></>);
const IconTable = icon(<><rect x="3" y="4" width="18" height="16" rx="1.5" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="12" y1="4" x2="12" y2="20" /></>);
const IconClear = icon(<><path d="M4 7h11l-2 11H7L4 7z" /><line x1="16" y1="5" x2="21" y2="10" /><line x1="21" y1="5" x2="16" y2="10" /></>);

export function ProductDescriptionEditor({ value, onChange }: ProductDescriptionEditorProps) {
  const lastEmittedRef = useRef<string | null>(null);

  const editor = useEditor({
    // Evita mismatch de hidratacion en Next (render diferido al cliente).
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: 'Descripcion con formato (fuente, tablas, listas...)',
      }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'description-editor-area',
        'data-placeholder': 'Descripcion con formato (fuente, tablas, listas...)',
      },
    },
    onUpdate: ({ editor: current }) => {
      const text = current.getText().trim();
      const html = text ? sanitizeDescriptionHtml(current.getHTML()) : '';
      lastEmittedRef.current = html;
      onChange(html);
    },
  });

  // Estados activos del toolbar (se recalculan en cada transaccion / seleccion).
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            bulletList: e.isActive('bulletList'),
            orderedList: e.isActive('orderedList'),
            alignLeft: e.isActive({ textAlign: 'left' }),
            alignCenter: e.isActive({ textAlign: 'center' }),
            alignRight: e.isActive({ textAlign: 'right' }),
          }
        : null,
  });

  // Sincroniza el contenido desde `value` cuando cambia por fuera (no por escritura propia).
  useEffect(() => {
    if (!editor) {
      return;
    }
    const incoming = value || '';
    if (incoming === (lastEmittedRef.current ?? '')) {
      return;
    }
    lastEmittedRef.current = incoming;
    editor.commands.setContent(incoming, { emitUpdate: false });
  }, [value, editor]);

  function focusChain() {
    return editor?.chain().focus();
  }

  function setBlock(block: 'p' | 'h2' | 'h3' | 'blockquote') {
    const chain = focusChain();
    if (!chain) {
      return;
    }
    if (block === 'p') {
      chain.setParagraph().run();
    } else if (block === 'blockquote') {
      chain.toggleBlockquote().run();
    } else {
      chain.toggleHeading({ level: block === 'h2' ? 2 : 3 }).run();
    }
  }

  function setFont(fontName: string) {
    if (!fontName) {
      return;
    }
    focusChain()?.setFontFamily(fontName).run();
  }

  function setColor(color: string) {
    if (!color) {
      return;
    }
    focusChain()?.setColor(color).run();
  }

  function setFontSize(size: string) {
    const chain = focusChain();
    if (!chain) {
      return;
    }
    if (!size) {
      chain.unsetFontSize().run();
      return;
    }
    chain.setFontSize(size).run();
  }

  function insertTable() {
    focusChain()?.insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run();
  }

  function clearFormat() {
    focusChain()?.unsetAllMarks().clearNodes().run();
  }

  return (
    <div className="description-editor-shell">
      <div className="description-toolbar">
        <div className="editor-tool-group">
          <select
            className="editor-tool-select"
            defaultValue=""
            aria-label="Tipo de bloque"
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
            className="editor-tool-select"
            defaultValue=""
            aria-label="Fuente"
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
            className="editor-tool-select"
            defaultValue=""
            aria-label="Tamano de texto"
            onChange={(event) => {
              setFontSize(event.target.value);
              event.currentTarget.value = '';
            }}
          >
            <option value="">Tamano</option>
            <option value="0.85em">Pequeno</option>
            <option value="1em">Normal</option>
            <option value="1.5em">Grande</option>
          </select>
        </div>

        <span className="editor-tool-sep" aria-hidden="true" />

        <div className="editor-tool-group">
          <button
            type="button"
            className={`editor-tool-btn${active?.bold ? ' is-active' : ''}`}
            title="Negrita"
            aria-label="Negrita"
            aria-pressed={active?.bold || false}
            onClick={() => focusChain()?.toggleBold().run()}
          >
            <b>B</b>
          </button>
          <button
            type="button"
            className={`editor-tool-btn${active?.italic ? ' is-active' : ''}`}
            title="Cursiva"
            aria-label="Cursiva"
            aria-pressed={active?.italic || false}
            onClick={() => focusChain()?.toggleItalic().run()}
          >
            <i>I</i>
          </button>
          <button
            type="button"
            className={`editor-tool-btn${active?.underline ? ' is-active' : ''}`}
            title="Subrayado"
            aria-label="Subrayado"
            aria-pressed={active?.underline || false}
            onClick={() => focusChain()?.toggleUnderline().run()}
          >
            <u>U</u>
          </button>
          <label className="editor-tool-btn editor-tool-color" title="Color de texto">
            <input type="color" onChange={(event) => setColor(event.target.value)} />
            <span className="editor-tool-color-glyph">A</span>
          </label>
        </div>

        <span className="editor-tool-sep" aria-hidden="true" />

        <div className="editor-tool-group">
          <button
            type="button"
            className={`editor-tool-btn${active?.bulletList ? ' is-active' : ''}`}
            title="Lista con vinetas"
            aria-label="Lista con vinetas"
            aria-pressed={active?.bulletList || false}
            onClick={() => focusChain()?.toggleBulletList().run()}
          >
            {IconBulletList}
          </button>
          <button
            type="button"
            className={`editor-tool-btn${active?.orderedList ? ' is-active' : ''}`}
            title="Lista numerada"
            aria-label="Lista numerada"
            aria-pressed={active?.orderedList || false}
            onClick={() => focusChain()?.toggleOrderedList().run()}
          >
            {IconOrderedList}
          </button>
        </div>

        <span className="editor-tool-sep" aria-hidden="true" />

        <div className="editor-tool-group">
          <button
            type="button"
            className={`editor-tool-btn${active?.alignLeft ? ' is-active' : ''}`}
            title="Alinear a la izquierda"
            aria-label="Alinear a la izquierda"
            aria-pressed={active?.alignLeft || false}
            onClick={() => focusChain()?.setTextAlign('left').run()}
          >
            {IconAlignLeft}
          </button>
          <button
            type="button"
            className={`editor-tool-btn${active?.alignCenter ? ' is-active' : ''}`}
            title="Centrar"
            aria-label="Centrar"
            aria-pressed={active?.alignCenter || false}
            onClick={() => focusChain()?.setTextAlign('center').run()}
          >
            {IconAlignCenter}
          </button>
          <button
            type="button"
            className={`editor-tool-btn${active?.alignRight ? ' is-active' : ''}`}
            title="Alinear a la derecha"
            aria-label="Alinear a la derecha"
            aria-pressed={active?.alignRight || false}
            onClick={() => focusChain()?.setTextAlign('right').run()}
          >
            {IconAlignRight}
          </button>
        </div>

        <span className="editor-tool-sep" aria-hidden="true" />

        <div className="editor-tool-group">
          <button type="button" className="editor-tool-btn" title="Insertar tabla" aria-label="Insertar tabla" onClick={insertTable}>
            {IconTable}
          </button>
          <button type="button" className="editor-tool-btn" title="Limpiar formato" aria-label="Limpiar formato" onClick={clearFormat}>
            {IconClear}
          </button>
        </div>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
