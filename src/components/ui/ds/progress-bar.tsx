import * as React from 'react';
import { cn } from '@/lib/utils';
import type { Tone } from './status-badge';

/**
 * ProgressBar do design system (Onda 2). Trilho de 4px (a espessura é uma das
 * três exceções ao grid de 8pt). Sempre acompanha rótulo e número — a barra
 * sozinha não comunica (DoD: nada só por cor).
 */
const fills: Record<Exclude<Tone, 'neutral' | 'info'>, string> = {
  brand: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  /** Texto à direita (ex.: "82%" ou "18/27"). Se ausente, mostra a porcentagem. */
  valueLabel?: string;
  tone?: keyof typeof fills;
  className?: string;
}

export function ProgressBar({ value, max = 100, label, valueLabel, tone = 'brand', className }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const shown = valueLabel ?? `${Math.round(pct)}%`;

  return (
    <div className={className}>
      {(label || shown) && (
        <div className="mb-1 flex items-baseline justify-between gap-2">
          {label && <span className="text-[13px] font-medium text-ink-700">{label}</span>}
          <span className="text-[13px] font-semibold tabular-nums text-ink-900">{shown}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1 w-full overflow-hidden rounded-pill bg-sunken"
      >
        <div
          className={cn('h-full rounded-pill transition-[width] duration-sgo-3 ease-sgo-std motion-reduce:transition-none', fills[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
