import * as React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * StatCard do design system — desde a Fase 4 do kit (v1.145.0) é o KPI do
 * kit de layout (`.sgo-kpi`, sgo-kit.css seção 8): cápsula de ícone, rótulo,
 * valor 23px/800 tabular e linha de apoio. A API não mudou, então as 29 telas
 * que o usam ganharam o cartão do kit sem reescrita.
 *
 * Regras que ficaram: valor ausente é "–" (nunca 0, que mentiria sobre o
 * dado); `tone` sinaliza ESTADO (pendência, concluído), nunca importância;
 * `delta` com `invertDelta` para métricas em que cair é bom.
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

/** Cor do VALOR (token do kit) e tom da CÁPSULA do ícone, por estado. */
const TONS = {
  default: { ink: 'var(--sgo-ink)', capsula: 'blue' },
  danger: { ink: 'var(--sgo-bad)', capsula: 'red' },
  success: { ink: 'var(--sgo-ok)', capsula: 'green' },
  warning: { ink: 'var(--sgo-warn)', capsula: 'amber' },
} as const;

export function StatCard({ label, value, hint, delta, invertDelta, tone = 'default', icon: Icon, className }: StatCardProps) {
  const empty = value === null || value === undefined || value === '';
  const good = delta == null ? null : invertDelta ? delta <= 0 : delta >= 0;
  const t = TONS[tone];

  return (
    <div className={cn('sgo-kpi min-w-0', className)} data-testid="stat-card">
      {Icon && (
        <div className={`sgo-kpi__ic sgo-kpi__ic--${t.capsula}`} aria-hidden>
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="sgo-kpi__label">{label}</div>
      <div className="sgo-kpi__value [overflow-wrap:anywhere]" style={{ color: empty ? 'var(--sgo-ink-3)' : t.ink }}>
        {empty ? '–' : value}
      </div>
      {(delta != null || hint) && (
        <div className={cn('sgo-kpi__meta flex items-center gap-1.5', delta != null && (good ? 'sgo-kpi__meta--up' : 'sgo-kpi__meta--down'))}>
          {delta != null && (
            <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums">
              {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
              {Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
            </span>
          )}
          {hint && <span className="truncate" style={{ color: 'var(--sgo-ink-3)' }}>{hint}</span>}
        </div>
      )}
    </div>
  );
}
