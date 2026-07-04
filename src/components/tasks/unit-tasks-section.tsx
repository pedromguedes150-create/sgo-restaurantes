'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface UnitSummary { total: number; done: number; late: number; missed: number; todo: number }

/**
 * Seção de tarefas de uma unidade: mini-dashboard SEMPRE visível + lista de
 * checklists recolhível. Recolhida por padrão quando há várias unidades, para o
 * gestor ver o resumo de todas de uma vez sem abrir cada uma.
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
    <section className="space-y-2 rounded-xl border bg-card/40 p-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-2 text-left">
        <span className="min-w-0 flex-1 space-y-1">
          {unitName && <span className="block text-sm font-bold uppercase tracking-wide text-muted-foreground">{unitName}</span>}
          {showSummary && (
            <>
              <span className="flex items-center justify-between text-sm">
                <span className={`font-semibold ${todo > 0 ? 'text-critical' : 'text-success'}`}>{todo > 0 ? `${todo} a fazer` : 'Tudo realizado ✅'}</span>
                <span className="text-xs text-muted-foreground">{done + late} de {total} feitos</span>
              </span>
              <span className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                <span className="h-full bg-success" style={{ width: `${pct(done)}%` }} />
                <span className="h-full bg-medium" style={{ width: `${pct(late)}%` }} />
                <span className="h-full bg-critical" style={{ width: `${pct(missed)}%` }} />
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>🟢 {done} no prazo</span>
                {late > 0 && <span>🟡 {late} fora do prazo</span>}
                {missed > 0 && <span>🔴 {missed} não realizada(s)</span>}
                {todo > 0 && <span className="font-semibold text-critical">⚪ {todo} a fazer</span>}
              </span>
            </>
          )}
        </span>
        <ChevronDown className={`mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="space-y-3 pt-1">{children}</div>}
    </section>
  );
}
