'use client';

import { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Heading, Link2 } from 'lucide-react';

/**
 * Editor de texto rico simples (contentEditable + execCommand) — negrito,
 * itálico, sublinhado, listas, subtítulo e link. Emite HTML no onChange.
 * O HTML deve ser sanitizado no servidor antes de salvar/renderizar
 * (ver `sanitizePopHtml` em `@/lib/pops`). Usado em POPs e na Minha área.
 */
export function RichText({ value, onChange, minHeight = 90, placeholder }: {
  value: string; onChange: (html: string) => void; minHeight?: number; placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inited = useRef(false);
  useEffect(() => { if (ref.current && !inited.current) { ref.current.innerHTML = value || ''; inited.current = true; } }, [value]);
  function exec(cmd: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML ?? '');
  }
  function addLink() {
    const url = window.prompt('Endereço do link (https://...)');
    if (url && /^(https?:|mailto:)/i.test(url)) exec('createLink', url);
  }
  const btn = 'rounded border px-2 py-1 text-sm hover:bg-sunken';
  return (
    <div className="rounded-lg border-2 border-line-strong bg-sgo-surface">
      <div className="flex flex-wrap gap-1 border-b p-1">
        <button type="button" className={btn} title="Negrito" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}><Bold className="h-4 w-4" /></button>
        <button type="button" className={btn} title="Itálico" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}><Italic className="h-4 w-4" /></button>
        <button type="button" className={btn} title="Sublinhado" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}><Underline className="h-4 w-4" /></button>
        <button type="button" className={btn} title="Subtítulo" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'H2')}><Heading className="h-4 w-4" /></button>
        <button type="button" className={btn} title="Lista" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}><List className="h-4 w-4" /></button>
        <button type="button" className={btn} title="Lista numerada" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')}><ListOrdered className="h-4 w-4" /></button>
        <button type="button" className={btn} title="Link" onMouseDown={(e) => e.preventDefault()} onClick={addLink}><Link2 className="h-4 w-4" /></button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder ?? 'Escreva o conteúdo…'}
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        className="pop-rich p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgo-brand"
        style={{ minHeight }}
      />
    </div>
  );
}
