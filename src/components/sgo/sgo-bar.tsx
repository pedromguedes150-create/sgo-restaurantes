import type { CSSProperties } from 'react';

/**
 * Barra de progresso do kit (3-componentes-sgo/SgoBar.tsx): trilho neutro,
 * preenchimento no tom semântico. O valor é limitado a 0–100.
 */
export type SgoBarTone = 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'sky' | 'neutral';

const COR: Record<SgoBarTone, string> = {
  green: 'var(--sgo-ok)',
  amber: 'var(--sgo-warn)',
  red: 'var(--sgo-bad)',
  blue: 'var(--sgo-accent)',
  violet: 'var(--sgo-violet)',
  sky: 'var(--sgo-sky)',
  neutral: 'var(--sgo-ink-3)',
};

export interface SgoBarProps {
  value: number | null | undefined;
  tone?: SgoBarTone;
  height?: number;
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
}

export function SgoBar({ value, tone = 'blue', height = 6, className, style, 'data-testid': testId }: SgoBarProps) {
  const pct = Math.max(0, Math.min(100, Number(value ?? 0) || 0));
  return (
    <div
      className={className}
      style={{ width: '100%', height, borderRadius: 99, background: 'rgb(var(--sgo-ink-500-rgb) / 0.16)', overflow: 'hidden', ...style }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      data-testid={testId}
    >
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: COR[tone], transition: 'width .3s var(--sgo-ease)' }} />
    </div>
  );
}
