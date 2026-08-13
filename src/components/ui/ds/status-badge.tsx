import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * StatusBadge do design system (Onda 2). O TEXTO carrega o significado — a cor
 * só reforça (DoD: nada só por cor). O ponto colorido é redundante e opcional.
 */
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const tones: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-700',
  success: 'bg-sgo-success-bg text-sgo-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  brand: 'bg-sgo-brand-tint-2 text-sgo-brand',
};
const dots: Record<Tone, string> = {
  neutral: 'bg-ink-400',
  success: 'bg-sgo-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  brand: 'bg-sgo-brand',
};

export function StatusBadge({
  tone = 'neutral', dot = false, children, className,
}: { tone?: Tone; dot?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[12px] font-semibold', tones[tone], className)}>
      {dot && <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-pill', dots[tone])} />}
      {children}
    </span>
  );
}
