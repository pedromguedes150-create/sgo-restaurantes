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
}

export function Select({
  options, value, onValueChange, placeholder = 'Selecione…',
  label, hint, error, required, disabled, size = 'md', className,
  'aria-label': ariaLabel, defaultOpen = false, onClose,
}: SelectProps) {
  const id = React.useId();
  const listId = `${id}-list`;
  const { descId, describedBy } = useDescribedBy(id, hint, error);
  const [open, setOpen] = React.useState(defaultOpen);

  // Um só caminho de fechamento, para o onClose nunca ficar de fora.
  const close = React.useCallback(() => { setOpen(false); onClose?.(); }, [onClose]);
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const selectedIdx = options.findIndex((o) => o.value === value);
  const selected = selectedIdx >= 0 ? options[selectedIdx] : null;

  React.useEffect(() => {
    if (!open) return;
    setActive(selectedIdx >= 0 ? selectedIdx : 0);
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, selectedIdx, close]);

  React.useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const step = (dir: 1 | -1) => {
    setActive((i) => {
      let n = i;
      for (let k = 0; k < options.length; k++) {
        n = (n + dir + options.length) % options.length;
        if (!options[n].disabled) return n;
      }
      return i;
    });
  };

  const choose = (i: number) => {
    const o = options[i];
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
    else if (e.key === 'Home') { e.preventDefault(); setActive(options.findIndex((o) => !o.disabled)); }
    else if (e.key === 'End') { e.preventDefault(); for (let i = options.length - 1; i >= 0; i--) if (!options[i].disabled) { setActive(i); break; } }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
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
          <span className={cn('truncate', !selected && 'text-ink-400')}>{selected?.label ?? placeholder}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform duration-sgo-1 motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
        </button>

        {open && (
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label={label ?? ariaLabel}
            className="absolute left-0 top-full z-40 mt-1 max-h-64 w-full overflow-auto rounded-card border border-line bg-sgo-surface p-1 shadow-lg"
          >
            {options.map((o, i) => {
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
                      'flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-[14px] outline-none',
                      o.disabled ? 'cursor-not-allowed text-ink-400' : i === active ? 'bg-sgo-brand-tint text-sgo-brand' : 'text-ink-700',
                    )}
                  >
                    <Check className={cn('h-4 w-4 shrink-0', isSel ? 'text-sgo-brand' : 'text-transparent')} aria-hidden />
                    <span className="flex-1">
                      <span className="block">{o.label}</span>
                      {o.hint && <span className="block text-[11px] text-ink-400">{o.hint}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Field>
  );
}
