import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Skeleton do design system (Onda 2): placeholder do CARREGAMENTO com a forma
 * do conteúdo que vai chegar — evita o "pulo" de layout. A animação é desligada
 * por prefers-reduced-motion (a classe .sgo-shimmer cuida disso).
 * aria-hidden: quem anuncia o carregamento é o container (aria-busy).
 */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('sgo-shimmer block rounded-control bg-sunken', className)} />;
}

/** Bloco de texto: várias linhas, a última mais curta (como texto real). */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span className={cn('block space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </span>
  );
}

/** Espelha o ListRow (64px, avatar 32) para a lista não "pular" ao carregar. */
export function SkeletonListRow() {
  return (
    <li className="flex h-16 items-center gap-3 border-b border-line px-4 last:border-b-0">
      <Skeleton className="h-8 w-8 shrink-0 rounded-pill" />
      <span className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-24" />
      </span>
      <Skeleton className="h-4 w-16 shrink-0" />
    </li>
  );
}

/** Espelha o StatCard (rótulo 11 / número 34 / apoio 13). */
export function SkeletonStatCard() {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="mt-2 h-8 w-24" />
      <Skeleton className="mt-2 h-3 w-16" />
    </div>
  );
}

/** Lista de esqueletos com o aria-busy no lugar certo. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <ul aria-busy="true" aria-label="Carregando" className="overflow-hidden rounded-card border border-line bg-surface">
      {Array.from({ length: rows }).map((_, i) => <SkeletonListRow key={i} />)}
    </ul>
  );
}
