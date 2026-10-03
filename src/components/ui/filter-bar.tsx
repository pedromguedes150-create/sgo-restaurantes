'use client';

import * as React from 'react';
import { Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, type SelectOption } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { Input } from '@/components/ui/ds/field';

/**
 * Barra de filtros PADRÃO do sistema — desde a Fase 4 do kit (v1.145.0) é a
 * LINHA DE FILTROS do kit de layout (`.sgo-filtros`, sgo-kit.css seção 22):
 * uma fileira que quebra linha, logo abaixo do cabeçalho da página, sem
 * cartão em volta. Ordem: [busca] [controles…] [resultado] [limpar].
 *
 * Os controles continuam os do design system (regra 6: nunca <select>
 * nativo) e a API não mudou — as 8 telas que a usam só trocaram de pele.
 * `collapsible` segue recolhendo os controles atrás do botão "Filtros".
 *
 * Uso:
 *   <FilterBar onClear={...} active={2}>
 *     <FilterSelect label="Período" options={[...]} value={v} onValueChange={setV} />
 *     <FilterDate label="De" value={de} onValueChange={setDe} />
 *   </FilterBar>
 */
export function FilterBar({
  children, onClear, active, className, title = 'Filtros',
  collapsible = false, search, summary, result,
}: {
  children: React.ReactNode;
  /** callback do botão "limpar"; se ausente, o botão não aparece */
  onClear?: () => void;
  /** quantos filtros estão ativos (mostra um contador e habilita "limpar") */
  active?: number;
  className?: string;
  title?: string;
  /**
   * Recolhe os controles atrás de um botão, deixando à vista só a busca, o
   * resumo do que está filtrado e o resultado. Numa lista longa, cinco
   * controles sempre abertos empurram o conteúdo para fora da tela — e a
   * pergunta de quem chega é "quantas notas tem", não "quais são os filtros".
   * Opt-in: as telas que já usavam a barra continuam abertas como estavam.
   */
  collapsible?: boolean;
  /** Fica SEMPRE visível, antes de tudo (a busca é o filtro mais usado). */
  search?: React.ReactNode;
  /** Resumo do que está filtrado — aparece quando recolhida, para o filtro
   *  ativo nunca ficar escondido explicando sozinho uma lista curta. */
  summary?: React.ReactNode;
  /** Contagem do resultado. Sempre visível: é o que a pessoa veio ver. */
  result?: React.ReactNode;
}) {
  const [aberto, setAberto] = React.useState(!collapsible);
  const mostrarControles = !collapsible || aberto;

  return (
    <div className={cn('sgo-filtros -mx-4 items-end', className)} data-testid="filter-bar">
      {search && <div className="min-w-[12rem] flex-1">{search}</div>}

      {collapsible ? (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="sgo-btn sgo-btn--sm"
        >
          <Filter className="h-3.5 w-3.5" aria-hidden /> {title}
          {active ? <span className="sgo-count">{active}</span> : null}
        </button>
      ) : (
        <span className="sgo-label inline-flex h-8 items-center gap-1.5 self-end">
          <Filter className="h-3.5 w-3.5" aria-hidden /> {title}
          {active ? <span className="sgo-count">{active}</span> : null}
        </span>
      )}

      {!mostrarControles && summary}

      {mostrarControles && children}

      {result && <span className="ml-auto self-center text-xs font-semibold tabular-nums" style={{ color: 'var(--sgo-ink)' }}>{result}</span>}

      {onClear && active ? (
        <button
          type="button"
          onClick={onClear}
          className={cn('sgo-btn sgo-btn--sm sgo-btn--ghost self-center', !result && 'ml-auto')}
        >
          <X className="h-3.5 w-3.5" aria-hidden /> Limpar
        </button>
      ) : null}
    </div>
  );
}

/** Etiqueta do resumo: o que está filtrado, quando a barra está recolhida. */
export function FilterChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="sgo-tag sgo-tag--gray">{children}</span>
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
      <span className="sgo-label">{label}</span>
      {children}
    </div>
  );
}
