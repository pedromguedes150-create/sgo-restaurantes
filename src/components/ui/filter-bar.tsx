'use client';

import * as React from 'react';
import { Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, type SelectOption } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { Input } from '@/components/ui/ds/field';

/**
 * Barra de filtros PADRÃO do sistema — compacta, responsiva e consistente.
 *
 * Onda 6: os controles passaram a ser os do design system. O FilterSelect era
 * um <select> NATIVO (regra 6) e recebia <option> como filhos; agora recebe
 * `options` e cada controle traz o próprio rótulo, com a associação
 * label↔campo feita pelo <Field> (antes o <label> envolvia o controle, o que
 * não associa quando o controle é um botão).
 *
 * Uso:
 *   <FilterBar onClear={...} active={2}>
 *     <FilterSelect label="Período" options={[...]} value={v} onValueChange={setV} />
 *     <FilterDate label="De" value={de} onValueChange={setDe} />
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
    <div className={cn('rounded-card border border-line bg-sgo-surface p-3', className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="sgo-type-11 flex items-center gap-1.5 text-ink-400">
          <Filter className="h-3.5 w-3.5" aria-hidden /> {title}
          {active ? <span className="rounded-pill bg-sgo-brand-tint-2 px-1.5 text-[11px] font-bold tabular-nums text-sgo-brand">{active}</span> : null}
        </p>
        {onClear && active ? (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 rounded-control px-1.5 py-0.5 text-[12px] font-semibold text-ink-500 outline-none hover:text-danger focus-visible:shadow-sgo-focus"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Limpar
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-2">{children}</div>
    </div>
  );
}

/** Envelope de largura mínima confortável (o rótulo vem do próprio controle). */
function Slot({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('min-w-[8.5rem] flex-1', className)}>{children}</div>;
}

export function FilterSelect({
  label, options, value, onValueChange, className,
}: {
  label: string;
  options: SelectOption[];
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
}) {
  return (
    <Slot className={className}>
      <Select label={label} options={options} value={value} onValueChange={onValueChange} size="sm" />
    </Slot>
  );
}

export function FilterDate({
  label, value, onValueChange, min, max, className,
}: {
  label: string;
  value: string | null;
  onValueChange: (v: string | null) => void;
  min?: string;
  max?: string;
  className?: string;
}) {
  return (
    <Slot className={className}>
      <DatePicker label={label} value={value} onValueChange={onValueChange} min={min} max={max} size="sm" />
    </Slot>
  );
}

export function FilterInput({
  label, className, ...props
}: { label: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>) {
  return (
    <Slot className={className}>
      <Input label={label} inputSize="sm" className="tabular-nums" {...props} />
    </Slot>
  );
}

/** Mantido para blocos que precisam de um rótulo solto acima de conteúdo livre. */
export function FilterField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-[8.5rem] flex-1 flex-col gap-0.5', className)}>
      <span className="text-[11px] font-semibold text-ink-500">{label}</span>
      {children}
    </div>
  );
}
