'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Field, controlBase, controlSize, controlTone, useDescribedBy } from './field';

/**
 * Select do design system (Onda 2) — CUSTOM, sem <select> nativo (regra 6).
 * Teclado: ↑/↓ move, Enter/Espaço abre e escolhe, Esc fecha, Home/End.
 * A11y: combobox + listbox/option com aria-selected e aria-activedescendant.
 */
export interface SelectOption { value: string; label: string; hint?: string; disabled?: boolean }

export interface SelectProps {
  options: SelectOption[];
  value: string | null;
  onValueChange: (v: string) => void;
  placeholder?: string;
  label?: string; hint?: string; error?: string; required?: boolean;
  disabled?: boolean;
  size?: keyof typeof controlSize;
  className?: string;
  /** Nome acessível quando não há rótulo visível (ex.: seletor compacto). */
  'aria-label'?: string;
  /** Já nasce aberto — para edição inline, em que o clique na célula abre. */
  defaultOpen?: boolean;
  /** Avisa quando fecha (escolha, Esc ou clique fora) — encerra a edição inline. */
  onClose?: () => void;
  /**
   * Campo de busca no topo da lista (v1.126.0). Para listas longas de pessoas —
   * colaboradores do RH, freelancers — em que rolar não serve. A busca ignora
   * acento e caixa: "mar" acha "Márcia" e "MARCOS".
   */
  searchable?: boolean;
  /** Texto do campo de busca. */
  searchPlaceholder?: string;
}

/** Sem acento e em minúsculas — "Márcia" e "marcia" são a mesma busca. */
export function normalizarBusca(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function Select({
  options, value, onValueChange, placeholder = 'Selecione…',
  label, hint, error, required, disabled, size = 'md', className,
  'aria-label': ariaLabel, defaultOpen = false, onClose,
  searchable = false, searchPlaceholder = 'Pesquisar…',
}: SelectProps) {
  const [query, setQuery] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);
  /* A lista navegável é a FILTRADA: setas, Enter e o destaque andam sobre o
     que está visível, não sobre a lista inteira. */
  const q = normalizarBusca(query);
  const list = React.useMemo(
    () => (searchable && q ? options.filter((o) => normalizarBusca(o.label).includes(q) || (o.hint ? normalizarBusca(o.hint).includes(q) : false)) : options),
    [options, searchable, q],
  );
  const id = React.useId();
  const listId = `${id}-list`;
  const { descId, describedBy } = useDescribedBy(id, hint, error);
  const [open, setOpen] = React.useState(defaultOpen);

  // Um só caminho de fechamento, para o onClose nunca ficar de fora.
  const close = React.useCallback(() => { setOpen(false); setQuery(''); onClose?.(); }, [onClose]);
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const selectedIdx = list.findIndex((o) => o.value === value);

  React.useEffect(() => {
    if (!open) return;
    setActive(selectedIdx >= 0 ? selectedIdx : 0);
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, selectedIdx, close]);

  // Com busca, o foco vai para o campo assim que abre: quem abre quer digitar.
  React.useEffect(() => { if (open && searchable) searchRef.current?.focus(); }, [open, searchable]);
  // Mudou o filtro: o destaque volta para o primeiro resultado.
  React.useEffect(() => { if (searchable) setActive(0); }, [q, searchable]);

  React.useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const step = (dir: 1 | -1) => {
    setActive((i) => {
      let n = i;
      for (let k = 0; k < list.length; k++) {
        n = (n + dir + list.length) % list.length;
        if (!list[n].disabled) return n;
      }
      return i;
    });
  };

  const choose = (i: number) => {
    const o = list[i];
    if (!o || o.disabled) return;
    onValueChange(o.value);
    close();
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    // No campo de busca, Espaço/Home/End são do texto — não escolhem nem pulam.
    else if (!searchable && e.key === 'Home') { e.preventDefault(); setActive(list.findIndex((o) => !o.disabled)); }
    else if (!searchable && e.key === 'End') { e.preventDefault(); for (let i = list.length - 1; i >= 0; i--) if (!list[i].disabled) { setActive(i); break; } }
    else if (e.key === 'Enter' || (!searchable && e.key === ' ')) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id} descId={descId}>
      <div className="relative" ref={rootRef}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
          // aria-invalid é válido em role=combobox (não seria num button puro).
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={onKeyDown}
          className={cn(controlBase, controlSize[size], controlTone(!!error), 'flex items-center justify-between gap-2 text-left', className)}
        >
          <span className={cn('truncate', !selected && 'text-ink-500')}>{selected?.label ?? placeholder}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform duration-sgo-1 motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-40 mt-1 w-full rounded-card border border-line bg-surface p-1 shadow-lg">
          {searchable && (
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={listId}
              aria-activedescendant={list.length ? `${id}-opt-${active}` : undefined}
              className="mb-1 h-9 w-full rounded-control border border-line bg-surface px-2 text-sm text-ink-900 outline-none focus:border-brand"
            />
          )}
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label={label ?? ariaLabel}
            className="max-h-64 overflow-auto"
          >
            {searchable && list.length === 0 && (
              <li role="presentation" className="px-2 py-2 text-sm text-ink-500">Nenhum resultado para “{query}”.</li>
            )}
            {list.map((o, i) => {
              const isSel = o.value === value;
              return (
                <li key={o.value} data-idx={i} id={`${id}-opt-${i}`} role="option" aria-selected={isSel} aria-disabled={o.disabled || undefined}>
                  <button
                    type="button"
                    tabIndex={-1}
                    disabled={o.disabled}
                    onClick={() => choose(i)}
                    onMouseMove={() => !o.disabled && setActive(i)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-sm outline-none',
                      o.disabled ? 'cursor-not-allowed text-ink-400' : i === active ? 'bg-brand-tint text-brand' : 'text-ink-700',
                    )}
                  >
                    <Check className={cn('h-4 w-4 shrink-0', isSel ? 'text-brand' : 'text-transparent')} aria-hidden />
                    <span className="flex-1">
                      <span className="block">{o.label}</span>
                      {o.hint && <span className="block text-[11px] text-ink-500">{o.hint}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          </div>
        )}
      </div>
    </Field>
  );
}
