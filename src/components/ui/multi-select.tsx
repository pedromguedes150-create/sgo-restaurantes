'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, X, Search } from 'lucide-react';

export interface MultiOption { value: string; label: string }

/**
 * Caixa de seleção múltipla (dropdown com checkboxes). Compacta e visível,
 * funciona no computador e no celular. Mostra as escolhidas como chips no botão
 * (ou "N selecionados") e abre um painel com busca + "selecionar todas/limpar".
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

  return (
    <div className="relative" ref={ref}>
      <div
        role="button" tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen((o) => !o); } }}
        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border-2 border-input bg-background px-3 py-1.5 text-sm ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        <span className="flex flex-1 flex-wrap items-center gap-1">
          {selected.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
          {selected.length > 0 && allOn && <span className="font-medium text-brand">Todas ({options.length})</span>}
          {selected.length > 0 && !allOn && selected.length <= 4 && selected.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              {labelFor(v)}
              <span role="button" tabIndex={-1} aria-label="Remover" onClick={(e) => { e.stopPropagation(); toggle(v); }} className="cursor-pointer hover:text-critical"><X className="h-3 w-3" /></span>
            </span>
          ))}
          {selected.length > 4 && !allOn && <span className="font-medium text-brand">{selected.length} selecionado(s)</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border bg-background shadow-lg">
          {searchable && (
            <div className="flex items-center gap-1 border-b px-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="h-9 w-full bg-transparent text-sm outline-none" />
            </div>
          )}
          {options.length > 0 && (
            <button type="button" onClick={toggleAll} className="w-full border-b px-3 py-2 text-left text-sm font-semibold text-accent hover:bg-secondary">
              {allOn ? 'Limpar seleção' : `Selecionar ${allLabel}`}
            </button>
          )}
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel}</p>}
            {filtered.map((o) => {
              const on = sel.has(o.value);
              return (
                <button key={o.value} type="button" onClick={() => toggle(o.value)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>{on && <Check className="h-3.5 w-3.5" />}</span>
                  <span className="flex-1">{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
