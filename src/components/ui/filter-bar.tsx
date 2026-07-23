'use client';

import * as React from 'react';
import { Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Barra de filtros PADRÃO do sistema — compacta, responsiva e consistente.
 * Antes cada tela montava filtros à mão com alturas/estilos diferentes (botões
 * "desfigurados"). Aqui os campos têm rótulo pequeno em cima, mesma altura (h-9),
 * quebram de linha no mobile e ocupam largura mínima confortável.
 *
 * Uso:
 *   <FilterBar onClear={...}>
 *     <FilterField label="Período"><FilterSelect .../></FilterField>
 *     <FilterField label="De"><FilterInput type="date" .../></FilterField>
 *   </FilterBar>
 */
export function FilterBar({
  children, onClear, active, className, title = 'Filtros',
}: {
  children: React.ReactNode;
  /** callback do botão "limpar"; se ausente, o botão não aparece */
  onClear?: () => void;
  /** quantos filtros estão ativos (mostra um contador e habilita "limpar") */
  active?: number;
  className?: string;
  title?: string;
}) {
  return (
    <div className={cn('rounded-lg border bg-card p-3', className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> {title}
          {active ? <span className="rounded-full bg-accent/15 px-1.5 text-[11px] font-bold text-accent">{active}</span> : null}
        </p>
        {onClear && active ? (
          <button type="button" onClick={onClear} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-critical">
            <X className="h-3.5 w-3.5" /> Limpar
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-2">{children}</div>
    </div>
  );
}

/** Um campo de filtro: rótulo pequeno + controle. Largura mínima confortável. */
export function FilterField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-[8.5rem] flex-1 flex-col gap-0.5', className)}>
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const controlCls =
  'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

export const FilterSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(controlCls, 'font-medium', className)} {...props} />,
);
FilterSelect.displayName = 'FilterSelect';

export const FilterInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(controlCls, 'tabular-nums', className)} {...props} />,
);
FilterInput.displayName = 'FilterInput';
