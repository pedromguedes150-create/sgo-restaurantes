import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * EmptyState do design system (Onda 2): ícone + título + apoio + ação.
 * Estado vazio nunca é uma frase solta — sempre diz o que fazer a seguir.
 */
export interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** `sm` para vazios dentro de cartões/abas; `md` para tela inteira. */
  size?: 'sm' | 'md';
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, size = 'md', className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', size === 'sm' ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-16', className)}>
      <span className={cn('flex items-center justify-center rounded-pill bg-sunken', size === 'sm' ? 'h-10 w-10' : 'h-14 w-14')}>
        <Icon className={cn('text-ink-400', size === 'sm' ? 'h-5 w-5' : 'h-6 w-6')} aria-hidden />
      </span>
      <p className={cn('font-semibold text-ink-900', size === 'sm' ? 'text-[15px]' : 'text-[17px]')}>{title}</p>
      {description && <p className="max-w-sm text-[14px] leading-5 text-ink-500">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
