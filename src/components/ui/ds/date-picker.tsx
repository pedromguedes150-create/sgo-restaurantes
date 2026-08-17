'use client';

import * as React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Field, controlBase, controlSize, controlTone, useDescribedBy } from './field';

/**
 * DatePicker do design system (Onda 2) — CUSTOM, sem <input type="date"> (regra 6).
 * Valor em 'AAAA-MM-DD' (mesma convenção de data operacional do projeto), então
 * não há conversão de fuso: as contas são feitas em UTC sobre y/m/d puros.
 * Teclado: ←/→/↑/↓ move o dia, PageUp/PageDown troca o mês, Enter escolhe, Esc fecha.
 */

import { toISO, parseISO, daysInMonth, firstWeekday, addDays, addMonths, formatBr, todayISO } from '@/lib/ds/date';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export interface DatePickerProps {
  value: string | null; // 'AAAA-MM-DD'
  onValueChange: (v: string | null) => void;
  min?: string; max?: string;
  label?: string; hint?: string; error?: string; required?: boolean;
  disabled?: boolean;
  size?: keyof typeof controlSize;
  placeholder?: string;
  className?: string;
  /** Nome acessível quando não há rótulo visível (ex.: campo em linha num filtro). */
  'aria-label'?: string;
}

export function DatePicker({
  value, onValueChange, min, max,
  label, hint, error, required, disabled, size = 'md', placeholder = 'dd/mm/aaaa', className,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const id = React.useId();
  const { descId, describedBy } = useDescribedBy(id, hint, error);
  const [open, setOpen] = React.useState(false);
  const [cursor, setCursor] = React.useState(() => value ?? todayISO());
  const rootRef = React.useRef<HTMLDivElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);

  const today = todayISO();
  const blocked = React.useCallback((iso: string) => (min && iso < min) || (max && iso > max), [min, max]);

  React.useEffect(() => {
    if (!open) return;
    setCursor(value ?? todayISO());
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, value]);

  React.useEffect(() => {
    if (open) gridRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.focus();
  }, [cursor, open]);

  const cur = parseISO(cursor)!;
  const total = daysInMonth(cur.y, cur.m);
  const offset = firstWeekday(cur.y, cur.m);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in moves) { e.preventDefault(); setCursor((c) => addDays(c, moves[e.key])); }
    else if (e.key === 'PageUp') { e.preventDefault(); setCursor((c) => addMonths(c, -1)); }
    else if (e.key === 'PageDown') { e.preventDefault(); setCursor((c) => addMonths(c, 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!blocked(cursor)) { onValueChange(cursor); setOpen(false); } }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  }

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id} descId={descId}>
      <div className="relative" ref={rootRef}>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          // Num <button> puro, aria-invalid não é suportado: o erro é anunciado
          // pelo texto do Field via aria-describedby.
          aria-describedby={describedBy}
          onClick={() => setOpen((v) => !v)}
          className={cn(controlBase, controlSize[size], controlTone(!!error), 'flex items-center gap-2 text-left tabular-nums', className)}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
          <span className={cn('flex-1', !value && 'text-ink-500')}>{value ? formatBr(value) : placeholder}</span>
        </button>

        {open && (
          <div
            role="dialog"
            aria-label="Escolher data"
            onKeyDown={onKeyDown}
            className="absolute left-0 top-full z-40 mt-1 w-[17.5rem] rounded-card border border-line bg-surface p-3 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <button type="button" aria-label="Mês anterior" onClick={() => setCursor((c) => addMonths(c, -1))}
                className="flex h-8 w-8 items-center justify-center rounded-control text-ink-500 outline-none hover:bg-sunken hover:text-ink-900 focus-visible:shadow-sgo-focus">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span aria-live="polite" className="text-[14px] font-semibold capitalize text-ink-900">{MESES[cur.m - 1]} {cur.y}</span>
              <button type="button" aria-label="Próximo mês" onClick={() => setCursor((c) => addMonths(c, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-control text-ink-500 outline-none hover:bg-sunken hover:text-ink-900 focus-visible:shadow-sgo-focus">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7">
              {DIAS.map((d, i) => (
                <span key={i} className="flex h-7 items-center justify-center text-[11px] font-semibold uppercase text-ink-500">{d}</span>
              ))}
            </div>

            <div ref={gridRef} className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: offset }).map((_, i) => <span key={`e${i}`} />)}
              {Array.from({ length: total }).map((_, i) => {
                const d = i + 1;
                const iso = toISO(cur.y, cur.m, d);
                const isSel = iso === value;
                const isToday = iso === today;
                const isCursor = iso === cursor;
                const off = blocked(iso);
                return (
                  <button
                    key={d}
                    type="button"
                    data-active={isCursor}
                    tabIndex={isCursor ? 0 : -1}
                    disabled={!!off}
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={isSel}
                    onClick={() => { onValueChange(iso); setOpen(false); }}
                    className={cn(
                      'flex h-9 items-center justify-center rounded-control text-[13px] tabular-nums outline-none transition-colors duration-sgo-1 focus-visible:shadow-sgo-focus motion-reduce:transition-none',
                      off ? 'cursor-not-allowed text-ink-400 opacity-40'
                        : isSel ? 'bg-brand font-semibold text-on-brand'
                        : 'text-ink-700 hover:bg-sunken',
                      isToday && !isSel && 'font-bold text-brand ring-1 ring-inset ring-brand',
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
              <button type="button" onClick={() => { if (!blocked(today)) { onValueChange(today); setOpen(false); } }}
                className="rounded-control px-2 py-1 text-[13px] font-medium text-brand outline-none hover:bg-brand-tint focus-visible:shadow-sgo-focus">
                Hoje
              </button>
              {value && (
                <button type="button" onClick={() => { onValueChange(null); setOpen(false); }}
                  className="rounded-control px-2 py-1 text-[13px] font-medium text-ink-500 outline-none hover:bg-sunken focus-visible:shadow-sgo-focus">
                  Limpar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Field>
  );
}
