import * as React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * StatCard do design system. Escala 11 / 24 / 13:
 * rótulo em caixa alta 11, número 24 tabular, apoio 13.
 *
 * O número era 34 — o MESMO tamanho e peso do título da página (LargeTitle).
 * Em Ocorrências isso punha quatro elementos no primeiro nível (o nome da tela
 * e os três contadores) e o olho não tinha por onde entrar na tela. O primeiro
 * nível volta a ser só o título; o número é o segundo.
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
  /** Cor do número. Sinaliza ESTADO (pendência, concluído), nunca importância. */
  tone?: 'default' | 'danger' | 'success' | 'warning';
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

const tones = {
  default: 'text-ink-900',
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
} as const;

export function StatCard({ label, value, hint, delta, invertDelta, tone = 'default', icon: Icon, className }: StatCardProps) {
  const empty = value === null || value === undefined || value === '';
  const good = delta == null ? null : invertDelta ? delta <= 0 : delta >= 0;

  return (
    <div className={cn('min-w-0 rounded-card border border-line bg-surface p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="sgo-type-11 font-semibold text-ink-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />}
      </div>
      <p className={cn('sgo-type-24 mt-1 font-semibold tabular-nums [overflow-wrap:anywhere]', empty ? 'text-ink-500' : tones[tone])}>
        {empty ? '–' : value}
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        {delta != null && (
          <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums', good ? 'text-success' : 'text-danger')}>
            {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
            {Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
          </span>
        )}
        {hint && <p className="sgo-type-13 truncate text-ink-500">{hint}</p>}
      </div>
    </div>
  );
}
