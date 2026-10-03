import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * StatusBadge do design system (Onda 2) — desde a Fase 4 do kit (v1.145.0)
 * é o SELO do kit de layout (`.sgo-tag`, sgo-kit.css seção 10): pílula 10.5px
 * com ponto na própria cor (o kit desenha o ponto; `dot` fica aceito por
 * compatibilidade e não muda nada). O TEXTO carrega o significado — a cor só
 * reforça (DoD: nada só por cor).
 *
 * Mapa de tons Restaurante → kit: `info` é `sky` (o azul-claro semântico do
 * kit, `--sgo-info`), e `brand` é `blue` — que no Restaurante aponta para o
 * bordô (`--sgo-accent: var(--sgo-brand)`, ver build-kit-css.cjs).
 */
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const TAG_CLASS: Record<Tone, string> = {
  neutral: 'sgo-tag--gray',
  success: 'sgo-tag--green',
  warning: 'sgo-tag--amber',
  danger: 'sgo-tag--red',
  info: 'sgo-tag--sky',
  brand: 'sgo-tag--blue',
};

export function StatusBadge({
  tone = 'neutral', children, className,
}: { tone?: Tone; dot?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('sgo-tag', TAG_CLASS[tone], className)}>
      {children}
    </span>
  );
}
