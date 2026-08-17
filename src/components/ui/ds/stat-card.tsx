import * as React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * StatCard do design system (Onda 2). Escala 11 / 34 / 13 (REDESIGN §4):
 * rótulo em caixa alta 11, número 34 tabular, apoio 13.
 * Valor ausente é "–" em ink-400 — nunca 0, que mentiria sobre o dado.
 */
export interface StatCardProps {
  label: string;
  /** `null` mostra "–" (sem dado), diferente de zero. */
  value: string | number | null;
  hint?: string;
  /** Variação percentual; o sinal define seta e cor. */
  delta?: number | null;
  /** Para métricas em que cair é bom (desperdício, custo). */
  invertDelta?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export function StatCard({ label, value, hint, delta, invertDelta, icon: Icon, className }: StatCardProps) {
  const empty = value === null || value === undefined || value === '';
  const good = delta == null ? null : invertDelta ? delta <= 0 : delta >= 0;

  return (
    <div className={cn('rounded-card border border-line bg-surface p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="sgo-type-11 text-ink-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />}
      </div>
      <p className={cn('sgo-type-34 mt-1 font-bold tabular-nums', empty ? 'text-ink-500' : 'text-ink-900')}>
        {empty ? '–' : value}
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        {delta != null && (
          <span className={cn('inline-flex items-center gap-0.5 text-[13px] font-semibold tabular-nums', good ? 'text-success' : 'text-danger')}>
            {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
            {Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
          </span>
        )}
        {hint && <p className="sgo-type-13 truncate text-ink-500">{hint}</p>}
      </div>
    </div>
  );
}
