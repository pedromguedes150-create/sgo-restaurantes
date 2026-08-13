'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface UnitSummary { total: number; done: number; late: number; missed: number; todo: number }

/**
 * Seção de tarefas de uma unidade: mini-dashboard SEMPRE visível + lista de
 * checklists recolhível. Recolhida por padrão quando há várias unidades, para o
 * gestor ver o resumo de todas de uma vez sem abrir cada uma.
 *
 * Onda 3: tokens do design system e legenda sem emoji de cor — cada faixa da
 * barra tem rótulo em texto (DoD: nada só por cor). Os filhos são <li> do
 * ListRow, então a lista é um <ul>.
 */
export function UnitTasksSection({ unitName, summary, showSummary, defaultOpen, children }: {
  unitName: string | null;
  summary: UnitSummary;
  showSummary: boolean;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { total, done, late, missed, todo } = summary;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);

  return (
    <section className="rounded-card border border-line bg-sgo-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 rounded-card p-4 text-left outline-none focus-visible:shadow-sgo-focus"
      >
        <span className="min-w-0 flex-1 space-y-1.5">
          {unitName && <span className="sgo-type-11 block text-ink-400">{unitName}</span>}
          {showSummary && (
            <>
              <span className="flex items-baseline justify-between gap-2">
                <span className={cn('text-[15px] font-semibold', todo > 0 ? 'text-ink-900' : 'text-sgo-success')}>
                  {todo > 0 ? `${todo} a fazer` : 'Tudo realizado'}
                </span>
                <span className="text-[13px] tabular-nums text-ink-500">{done + late} de {total} feitos</span>
              </span>
              <span className="flex h-1 w-full overflow-hidden rounded-pill bg-sunken">
                <span className="h-full bg-sgo-success" style={{ width: `${pct(done)}%` }} />
                <span className="h-full bg-warning" style={{ width: `${pct(late)}%` }} />
                <span className="h-full bg-danger" style={{ width: `${pct(missed)}%` }} />
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] tabular-nums text-ink-500">
                <span>{done} no prazo</span>
                {late > 0 && <span>{late} fora do prazo</span>}
                {missed > 0 && <span>{missed} não realizada(s)</span>}
                {todo > 0 && <span className="font-semibold text-ink-900">{todo} a fazer</span>}
              </span>
            </>
          )}
        </span>
        <ChevronDown
          className={cn('mt-0.5 h-5 w-5 shrink-0 text-ink-400 transition-transform duration-sgo-2 ease-sgo-std motion-reduce:transition-none', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && <ul className="border-t border-line">{children}</ul>}
    </section>
  );
}
