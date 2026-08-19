'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ListRow do design system (Onda 2): linha de 64px, avatar 32, divisor
 * RECUADO 16px à esquerda (alinha com o texto, não com a borda do cartão).
 * Substitui os "cartões por registro" das telas legadas (Onda 3).
 */

export function List({ children, stagger = true, className }: { children: React.ReactNode; stagger?: boolean; className?: string }) {
  return (
    <ul className={cn('overflow-hidden rounded-card border border-line bg-surface', stagger && 'sgo-stagger', className)}>
      {children}
    </ul>
  );
}

/** Avatar circular de 32px com iniciais. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      aria-hidden
      className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-brand-tint-2 text-xs font-bold text-brand', className)}
    >
      {initials}
    </span>
  );
}

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Elemento à esquerda: <Avatar/> ou um ícone. */
  leading?: React.ReactNode;
  /** Elemento à direita: valor, StatusBadge, botão… */
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /**
   * Conteúdo à esquerda FORA do elemento interativo (ex.: caixa de seleção).
   * Precisa ficar fora porque um <input> dentro de um <button> é HTML inválido
   * e o clique de um roubaria o do outro.
   */
  selectionSlot?: React.ReactNode;
  className?: string;
}

export function ListRow({ title, subtitle, leading, trailing, href, onClick, disabled, selectionSlot, className }: ListRowProps) {
  const interactive = !!(href || onClick) && !disabled;

  const inner = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">{title}</span>
        {subtitle && <span className="block truncate text-xs text-ink-500">{subtitle}</span>}
      </span>
      {trailing && <span className="flex shrink-0 items-center gap-2">{trailing}</span>}
      {interactive && <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />}
    </>
  );

  // Divisor recuado: pseudo-elemento a 16px da esquerda; some na última linha.
  // Com caixa de seleção, o divisor vai no <li> (o interativo não ocupa a linha toda).
  const base = cn(
    // Altura ADAPTATIVA (Onda 8), não fixa em 64px: no iOS a linha simples tem
    // 44pt e só cresce quando ganha segunda linha. Com altura travada, uma lista
    // de linhas sem subtítulo desperdiçava 20px por item — em 20 itens, uma tela
    // inteira de rolagem. O mínimo de 44px é também o alvo de toque (regra 8).
    'relative flex min-h-11 w-full items-center gap-3 py-2 text-left outline-none',
    selectionSlot ? 'pr-4' : 'px-4',
    !selectionSlot && "after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-line after:content-[''] last:after:hidden",
    interactive && 'transition-colors duration-sgo-1 ease-sgo-std hover:bg-sunken focus-visible:shadow-sgo-focus motion-reduce:transition-none',
    disabled && 'opacity-40',
    className,
  );

  const control = href && !disabled ? (
    <Link href={href} className={base}>{inner}</Link>
  ) : onClick && !disabled ? (
    <button type="button" onClick={onClick} className={base}>{inner}</button>
  ) : (
    <div className={base}>{inner}</div>
  );

  if (selectionSlot) {
    return (
      <li className="relative flex items-center gap-2 pl-4 after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-line after:content-[''] last:after:hidden">
        <span className="shrink-0">{selectionSlot}</span>
        <span className="min-w-0 flex-1">{control}</span>
      </li>
    );
  }

  return <li className="[&:last-child>*]:after:hidden">{control}</li>;
}
