'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Table do design system (Onda 2). A API é dirigida por COLUNAS de propósito:
 * assim as regras não dependem da disciplina de quem usa —
 *  - coluna `numeric` já sai alinhada à direita e com tabular-nums (regra 7);
 *  - valor ausente vira "–" em ink-400 (nunca 0, que mentiria);
 *  - o cabeçalho gruda no topo ao rolar;
 *  - a tabela rola no PRÓPRIO container (a página nunca rola na horizontal).
 */
export interface Column<T> {
  key: string;
  header: string;
  /** Números: alinha à direita e usa tabular-nums. */
  numeric?: boolean;
  /** Conteúdo da célula. Devolver null/undefined mostra "–". */
  cell: (row: T) => React.ReactNode;
  /** Largura fixa opcional (ex.: '8rem'). */
  width?: string;
  /** Esconde no celular, quando a coluna é secundária. */
  hideOnMobile?: boolean;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  /** Mostrado no lugar do corpo quando não há linhas (use <EmptyState/>). */
  empty?: React.ReactNode;
  /** Descrição da tabela para leitor de tela. */
  caption?: string;
  className?: string;
}

const EMPTY = <span className="text-ink-500">–</span>;

export function Table<T>({ columns, rows, getRowKey, onRowClick, empty, caption, className }: TableProps<T>) {
  if (rows.length === 0 && empty) {
    return <div className={cn('rounded-card border border-line bg-surface', className)}>{empty}</div>;
  }

  return (
    // Contêiner com rolagem própria: conteúdo largo nunca faz a página rolar.
    <div className={cn('max-h-[70vh] overflow-auto rounded-card border border-line bg-surface', className)}>
      <table className="w-full border-collapse text-[14px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={cn(
                  'whitespace-nowrap border-b border-line px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-ink-500',
                  c.numeric ? 'text-right' : 'text-left',
                  c.hideOnMobile && 'hidden md:table-cell',
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={getRowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
              className={cn(
                'border-b border-line last:border-b-0',
                onRowClick && 'cursor-pointer outline-none transition-colors duration-sgo-1 hover:bg-sunken focus-visible:shadow-sgo-focus motion-reduce:transition-none',
              )}
            >
              {columns.map((c) => {
                const v = c.cell(row);
                const vazio = v === null || v === undefined || v === '';
                return (
                  <td
                    key={c.key}
                    className={cn(
                      'px-3 py-2 text-ink-700',
                      c.numeric ? 'text-right tabular-nums' : 'text-left',
                      c.hideOnMobile && 'hidden md:table-cell',
                    )}
                  >
                    {vazio ? EMPTY : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
