'use client';

import * as React from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Field, controlBase, controlSize, controlTone, useDescribedBy } from './field';
import { toHM, parseHM, hourOptions, minuteOptions, snapToStep, outOfRange, nowHM } from '@/lib/ds/time';

/**
 * TimePicker do design system (Onda 6) — CUSTOM, sem <input type="time">.
 * A regra 6 do contrato nomeia select e date, mas o campo de hora nativo tem o
 * mesmo problema: aparência do sistema operacional, fora dos tokens, e no
 * Android abre um relógio analógico que ninguém pediu.
 *
 * Valor em 'HH:MM' de 24h — exatamente o que o <input type="time"> devolvia,
 * então nenhum consumidor precisa converter nada.
 *
 * Duas colunas (hora e minuto) em vez de um campo mascarado: horário de turno
 * é escolha entre poucas opções conhecidas, não digitação livre.
 * Teclado: ↑/↓ anda na coluna, ←/→ troca de coluna, Enter escolhe, Esc fecha.
 */
export interface TimePickerProps {
  value: string | null; // 'HH:MM'
  onValueChange: (v: string | null) => void;
  /** Limites inclusivos, para pares início/fim. */
  min?: string; max?: string;
  /** Passo da coluna de minutos. 5 cobre escala e ponto sem virar uma lista de 60. */
  minuteStep?: number;
  label?: string; hint?: string; error?: string; required?: boolean;
  disabled?: boolean;
  size?: keyof typeof controlSize;
  placeholder?: string;
  className?: string;
  /** Nome acessível quando não há rótulo visível. */
  'aria-label'?: string;
}

export function TimePicker({
  value, onValueChange, min, max, minuteStep = 5,
  label, hint, error, required, disabled, size = 'md', placeholder = '--:--', className,
  'aria-label': ariaLabel,
}: TimePickerProps) {
  const id = React.useId();
  const { descId, describedBy } = useDescribedBy(id, hint, error);
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const HOURS = React.useMemo(() => hourOptions(), []);
  const MINUTES = React.useMemo(() => minuteOptions(minuteStep), [minuteStep]);

  // O cursor é o que as setas movem; só vira valor no Enter/clique.
  const [cursor, setCursor] = React.useState(() => snapToStep(value ?? nowHM(new Date(), minuteStep), minuteStep));
  const [col, setCol] = React.useState<'h' | 'm'>('h');
  const cur = parseHM(cursor) ?? { h: 0, m: 0 };

  React.useEffect(() => {
    if (!open) return;
    setCursor(snapToStep(value ?? nowHM(new Date(), minuteStep), minuteStep));
    setCol('h');
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, value, minuteStep]);

  // As opções são tabIndex=-1: o foco vai na que está sob o cursor, para as
  // teclas chegarem ao diálogo. Também mantém a opção visível na coluna rolante.
  React.useEffect(() => {
    if (!open) return;
    const el = rootRef.current?.querySelector<HTMLElement>('[data-cursor="true"]');
    el?.scrollIntoView({ block: 'nearest' });
    el?.focus();
  }, [cursor, col, open]);

  const blocked = (hm: string) => outOfRange(hm, min, max);

  /** Anda na coluna ativa dando a volta, pulando o que está fora da faixa. */
  function step(dir: 1 | -1) {
    const list = col === 'h' ? HOURS : MINUTES;
    const atual = col === 'h' ? cur.h : cur.m;
    let i = list.indexOf(atual);
    if (i < 0) i = 0;
    for (let k = 0; k < list.length; k++) {
      i = (i + dir + list.length) % list.length;
      const next = col === 'h' ? toHM(list[i], cur.m) : toHM(cur.h, list[i]);
      if (!blocked(next)) { setCursor(next); return; }
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setCol('m'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setCol('h'); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!blocked(cursor)) { onValueChange(cursor); setOpen(false); } }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  }

  const coluna = (tipo: 'h' | 'm', lista: number[]) => (
    <ul role="listbox" aria-label={tipo === 'h' ? 'Hora' : 'Minuto'} className="max-h-48 flex-1 overflow-auto">
      {lista.map((n) => {
        const hm = tipo === 'h' ? toHM(n, cur.m) : toHM(cur.h, n);
        const isCursor = tipo === col && n === (tipo === 'h' ? cur.h : cur.m);
        const isSel = hm === value;
        const off = blocked(hm);
        return (
          <li key={n} role="option" aria-selected={isSel} aria-disabled={off || undefined}>
            <button
              type="button"
              tabIndex={-1}
              disabled={off}
              data-cursor={isCursor}
              onClick={() => { setCol(tipo); if (!off) { onValueChange(hm); setOpen(false); } }}
              onMouseMove={() => { if (!off) { setCol(tipo); setCursor(hm); } }}
              className={cn(
                'flex w-full items-center justify-center rounded-control py-2 text-[14px] tabular-nums outline-none transition-colors duration-sgo-1 motion-reduce:transition-none',
                off ? 'cursor-not-allowed text-ink-400 opacity-40'
                  : isSel ? 'bg-brand font-semibold text-on-brand'
                  : isCursor ? 'bg-brand-tint text-brand'
                  : 'text-ink-700 hover:bg-sunken',
              )}
            >
              {String(n).padStart(2, '0')}
            </button>
          </li>
        );
      })}
    </ul>
  );

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
          <Clock className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
          <span className={cn('flex-1', !value && 'text-ink-500')}>{value ?? placeholder}</span>
        </button>

        {open && (
          <div
            role="dialog"
            aria-label="Escolher horário"
            onKeyDown={onKeyDown}
            className="absolute left-0 top-full z-40 mt-1 w-40 rounded-card border border-line bg-surface p-2 shadow-lg"
          >
            <div className="mb-1 flex gap-1 text-[11px] font-semibold uppercase text-ink-500">
              <span className="flex-1 text-center">Hora</span>
              <span className="flex-1 text-center">Min</span>
            </div>
            <div className="flex gap-1">
              {coluna('h', HOURS)}
              {coluna('m', MINUTES)}
            </div>
            {value && (
              <div className="mt-2 border-t border-line pt-2">
                <button
                  type="button"
                  onClick={() => { onValueChange(null); setOpen(false); }}
                  className="w-full rounded-control px-2 py-1 text-[13px] font-medium text-ink-500 outline-none hover:bg-sunken focus-visible:shadow-sgo-focus"
                >
                  Limpar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}
