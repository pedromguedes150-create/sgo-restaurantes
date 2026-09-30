'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
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
const POP_W = 280; // 17.5rem

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
  /* O calendário é PORTALADO para `document.body` e posicionado com
     `position: fixed` a partir do retângulo do botão — não mais `absolute`
     dentro do próprio campo.
     Por quê: um DatePicker "Início"/"Fim" lado a lado (grade de 2 colunas) num
     Sheet (modal com `overflow-y-auto` e altura travada) tinha o popup preso
     DENTRO daquele contêiner rolável — o CSS corta (clip) qualquer parte de um
     elemento `absolute` que ultrapasse um ancestral com overflow, não importa
     o `z-index`. O calendário abria com a grade de dias e as setas cortadas,
     e uma barra de rolagem aparecia em cima do card inteiro (visto no relato
     da "Folga/férias" em Escala de gerentes). Com portal + `fixed` calculado
     pela posição na VIEWPORT, o popup flutua por cima de tudo, imune a
     qualquer `overflow` de ancestrais. */
  const [coords, setCoords] = React.useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);

  const today = todayISO();
  const blocked = React.useCallback((iso: string) => (min && iso < min) || (max && iso > max), [min, max]);

  const reposition = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    /* Altura real do popup — medida do próprio DOM (já montado, mesmo que fora
       da tela) em vez de estimada: o mês pode ter 5 ou 6 semanas na grade. */
    const popH = popupRef.current?.offsetHeight ?? 360;
    const MARGEM = 8;
    const espacoAbaixo = window.innerHeight - rect.bottom;
    const espacoAcima = rect.top;
    /* Abre para BAIXO por padrão; só sobe se faltar espaço embaixo E houver
       mais espaço em cima — sem isto, um campo no meio de um formulário longo
       dentro de um Sheet abria sempre para baixo e era cortado pelo rodapé do
       modal, mesmo quando "virar para cima" resolveria. */
      const openUp = espacoAbaixo < popH + MARGEM && espacoAcima > espacoAbaixo;
    const top = openUp ? rect.top - popH - 4 : rect.bottom + 4;
    const left = rect.left + POP_W > window.innerWidth - MARGEM ? rect.right - POP_W : rect.left;
    setCoords({
      top: Math.max(MARGEM, Math.min(top, window.innerHeight - MARGEM)),
      left: Math.max(MARGEM, Math.min(left, window.innerWidth - POP_W - MARGEM)),
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setCursor(value ?? todayISO());
    const onDown = (e: MouseEvent) => {
      const alvo = e.target as Node;
      /* O popup agora vive fora de `rootRef` (portalado) — o clique dentro
         dele não pode fechar o calendário. */
      if (rootRef.current?.contains(alvo) || popupRef.current?.contains(alvo)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    /* Fecha ao rolar: reposicionar em tempo real acompanhando o scroll de um
       contêiner interno (o Sheet, por exemplo) exigiria recalcular a cada
       evento — fechar é o mesmo comportamento já usado pelo `ActionMenu` do
       sistema para o mesmo problema. `capture: true` porque o scroll de um
       contêiner interno não borbulha até o document na fase normal. */
    const onScroll = () => setOpen(false);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, value]);

  React.useLayoutEffect(() => {
    if (open) reposition();
  }, [open, cursor, reposition]);

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
          ref={triggerRef}
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

        {open && createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label="Escolher data"
            onKeyDown={onKeyDown}
            style={{ position: 'fixed', top: coords.top, left: coords.left }}
            className="z-50 w-[17.5rem] max-w-[calc(100vw-1rem)] rounded-card border border-line bg-surface p-3 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <button type="button" aria-label="Mês anterior" onClick={() => setCursor((c) => addMonths(c, -1))}
                className="flex h-8 w-8 items-center justify-center rounded-control text-ink-500 outline-none hover:bg-sunken hover:text-ink-900 focus-visible:shadow-sgo-focus">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span aria-live="polite" className="text-sm font-semibold capitalize text-ink-900">{MESES[cur.m - 1]} {cur.y}</span>
              <button type="button" aria-label="Próximo mês" onClick={() => setCursor((c) => addMonths(c, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-control text-ink-500 outline-none hover:bg-sunken hover:text-ink-900 focus-visible:shadow-sgo-focus">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7">
              {DIAS.map((d, i) => (
                <span key={i} className="flex h-7 items-center justify-center sgo-type-11 font-semibold text-ink-500">{d}</span>
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
                      'flex h-9 items-center justify-center rounded-control text-xs tabular-nums outline-none transition-colors duration-sgo-1 focus-visible:shadow-sgo-focus motion-reduce:transition-none',
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
                className="rounded-control px-2 py-1 text-xs font-medium text-brand outline-none hover:bg-brand-tint focus-visible:shadow-sgo-focus">
                Hoje
              </button>
              {value && (
                <button type="button" onClick={() => { onValueChange(null); setOpen(false); }}
                  className="rounded-control px-2 py-1 text-xs font-medium text-ink-500 outline-none hover:bg-sunken focus-visible:shadow-sgo-focus">
                  Limpar
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
      </div>
    </Field>
  );
}
