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

export function List({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn('overflow-hidden rounded-card border border-line bg-sgo-surface', className)}>{children}</ul>;
}

/** Avatar circular de 32px com iniciais. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      aria-hidden
      className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-sgo-brand-tint-2 text-[12px] font-bold text-sgo-brand', className)}
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
  className?: string;
}

export function ListRow({ title, subtitle, leading, trailing, href, onClick, disabled, className }: ListRowProps) {
  const interactive = !!(href || onClick) && !disabled;

  const inner = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink-900">{title}</span>
        {subtitle && <span className="block truncate text-[13px] text-ink-500">{subtitle}</span>}
      </span>
      {trailing && <span className="flex shrink-0 items-center gap-2">{trailing}</span>}
      {interactive && <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />}
    </>
  );

  // Divisor recuado: pseudo-elemento a 16px da esquerda; some na última linha.
  const base = cn(
    'relative flex h-16 w-full items-center gap-3 px-4 text-left outline-none',
    "after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-line after:content-['']",
    'last:after:hidden',
    interactive && 'transition-colors duration-sgo-1 ease-sgo-std hover:bg-sunken focus-visible:shadow-sgo-focus motion-reduce:transition-none',
    disabled && 'opacity-40',
    className,
  );

  return (
    <li className="[&:last-child>*]:after:hidden">
      {href && !disabled ? (
        <Link href={href} className={base}>{inner}</Link>
      ) : onClick && !disabled ? (
        <button type="button" onClick={onClick} className={base}>{inner}</button>
      ) : (
        <div className={base}>{inner}</div>
      )}
    </li>
  );
}
