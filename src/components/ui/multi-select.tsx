'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Check, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MultiOption { value: string; label: string }

/**
 * Caixa de seleção múltipla (dropdown com checkboxes). Compacta e visível,
 * funciona no computador e no celular.
 *
 * Onda 6 — dois problemas corrigidos, mantendo a API pública intacta (8 telas
 * dependem dela):
 *  1. O gatilho era um <div role="button"> com os "x" de remover DENTRO dele,
 *     ou seja, controles aninhados: HTML inválido, e o clique de um roubava o
 *     do outro. Agora o gatilho é um <button> de verdade e os chips removíveis
 *     ficam ABAIXO dele.
 *  2. Sem semântica de lista: agora é combobox + listbox/option com
 *     aria-selected, e o painel tem anel de foco em todos os controles.
 */
export function MultiSelect({
  options, selected, onChange,
  placeholder = 'Selecionar…', searchable = false, allLabel = 'todas', emptyLabel = 'Nenhuma opção', disabled = false,
}: {
  options: MultiOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  allLabel?: string;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const listId = `${useId()}-list`;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const sel = new Set(selected);
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const allOn = options.length > 0 && selected.length === options.length;
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  function toggle(v: string) { const n = new Set(sel); n.has(v) ? n.delete(v) : n.add(v); onChange([...n]); }
  function toggleAll() { onChange(allOn ? [] : options.map((o) => o.value)); }

  const resumo =
    selected.length === 0 ? placeholder
    : allOn ? `Todas (${options.length})`
    : selected.length <= 4 ? selected.map(labelFor).join(', ')
    : `${selected.length} selecionado(s)`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex min-h-11 w-full items-center justify-between gap-2 rounded-control border border-line-strong bg-surface px-3 py-1.5 text-left text-[14px] outline-none',
          'transition-colors duration-sgo-1 ease-sgo-std hover:border-ink-400 focus-visible:shadow-sgo-focus',
          'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-400',
        )}
      >
        <span className={cn('flex-1 truncate', selected.length === 0 ? 'text-ink-500' : 'font-medium text-ink-900')}>{resumo}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform duration-sgo-1 motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>

      {/* Chips removíveis FORA do gatilho — dentro seriam botões aninhados. */}
      {!allOn && selected.length > 0 && selected.length <= 4 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selected.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-pill bg-brand-tint-2 py-0.5 pl-2 pr-1 text-[12px] font-medium text-ink-900">
              {labelFor(v)}
              <button
                type="button"
                onClick={() => toggle(v)}
                aria-label={`Remover ${labelFor(v)}`}
                disabled={disabled}
                className="flex h-4 w-4 items-center justify-center rounded-pill outline-none hover:bg-brand/15 focus-visible:shadow-sgo-focus"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-card border border-line bg-surface shadow-lg">
          {searchable && (
            <div className="flex items-center gap-1 border-b border-line px-2">
              <Search className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar…"
                aria-label="Buscar opções"
                className="h-9 w-full bg-transparent text-[14px] text-ink-900 outline-none placeholder:text-ink-500"
              />
            </div>
          )}
          {options.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="w-full border-b border-line px-3 py-2 text-left text-[14px] font-semibold text-brand outline-none hover:bg-sunken focus-visible:shadow-sgo-focus"
            >
              {allOn ? 'Limpar seleção' : `Selecionar ${allLabel}`}
            </button>
          )}
          <ul id={listId} role="listbox" aria-multiselectable className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-[14px] text-ink-500">{emptyLabel}</li>}
            {filtered.map((o) => {
              const on = sel.has(o.value);
              return (
                <li key={o.value} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] text-ink-700 outline-none hover:bg-sunken focus-visible:shadow-sgo-focus"
                  >
                    <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', on ? 'border-brand bg-brand text-on-brand' : 'border-line-strong')}>
                      {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                    </span>
                    <span className="flex-1">{o.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
