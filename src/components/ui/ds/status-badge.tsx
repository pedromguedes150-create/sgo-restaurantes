import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * StatusBadge do design system (Onda 2). O TEXTO carrega o significado — a cor
 * só reforça (DoD: nada só por cor). O ponto colorido é redundante e opcional.
 */
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

/**
 * O anel interno de 1px é o acabamento: sobre `surface` os fundos de status são
 * claríssimos (danger-bg é 254 243 242) e a pílula some, virando texto colorido
 * solto. O anel devolve a forma sem escurecer o fundo — e usa a própria cor do
 * tom, em alfa baixo, para não virar uma borda cinza genérica.
 */
const tones: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-700 ring-1 ring-inset ring-ink-400/20',
  success: 'bg-success-bg text-success ring-1 ring-inset ring-success/20',
  warning: 'bg-warning-bg text-warning ring-1 ring-inset ring-warning/20',
  danger: 'bg-danger-bg text-danger ring-1 ring-inset ring-danger/20',
  info: 'bg-info-bg text-info ring-1 ring-inset ring-info/20',
  brand: 'bg-brand-tint-2 text-brand ring-1 ring-inset ring-brand/20',
};
const dots: Record<Tone, string> = {
  neutral: 'bg-ink-400',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  brand: 'bg-brand',
};

export function StatusBadge({
  tone = 'neutral', dot = false, children, className,
}: { tone?: Tone; dot?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-xs font-semibold', tones[tone], className)}>
      {dot && <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-pill', dots[tone])} />}
      {children}
    </span>
  );
}
