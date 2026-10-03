'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Table do design system (Onda 2) — desde a Fase 4 do kit (v1.145.0) sai como
 * a TABELA DENSA do kit de layout: painel (`.sgo-panel`, que fica sólido
 * quando contém tabela) + `.sgo-tbl` (cabeçalho em caixa alta 10px, linhas
 * 12.5px tabulares, hover). A API dirigida por COLUNAS não mudou:
 *  - coluna `numeric` já sai alinhada à direita (`.r` do kit) e tabular;
 *  - valor ausente vira "–" (nunca 0, que mentiria);
 *  - o cabeçalho gruda no topo ao rolar (regra do próprio `.sgo-tbl th`);
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
  /** Deixa o texto quebrar linha (o kit não quebra por padrão). */
  wrap?: boolean;
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
  /**
   * Linha de TOTAL no rodapé, por chave de coluna (v1.127.0). Toda tabela com
   * dinheiro na tela deve somar sozinha — o pedido foi literal: "não quero
   * precisar de calculadora". Coluna sem chave aqui fica vazia no rodapé.
   */
  footer?: Record<string, React.ReactNode>;
  /** Linhas e cabeçalho mais apertados (`.sgo-dense` do kit), para telas cheias. */
  dense?: boolean;
  className?: string;
}

const EMPTY = <span style={{ color: 'var(--sgo-ink-3)' }}>–</span>;

export function Table<T>({ columns, rows, getRowKey, onRowClick, empty, caption, className, footer, dense }: TableProps<T>) {
  if (rows.length === 0 && empty) {
    return <div className={cn('sgo-panel', className)}>{typeof empty === 'string' ? <p className="px-4 py-6 text-sm" style={{ color: 'var(--sgo-ink-2)' }}>{empty}</p> : empty}</div>;
  }

  return (
    // Contêiner com rolagem própria: conteúdo largo nunca faz a página rolar.
    <div className={cn('sgo-panel max-h-[70vh] overflow-auto', dense && 'sgo-dense', className)}>
      <table className="sgo-tbl">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={cn(c.numeric && 'r', c.hideOnMobile && 'hidden md:table-cell')}
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
              className={cn(onRowClick && 'cursor-pointer outline-none focus-visible:shadow-sgo-focus')}
            >
              {columns.map((c) => {
                const v = c.cell(row);
                const vazio = v === null || v === undefined || v === '';
                return (
                  <td
                    key={c.key}
                    className={cn(c.numeric && 'r', c.wrap && 'whitespace-normal', c.hideOnMobile && 'hidden md:table-cell')}
                  >
                    {vazio ? EMPTY : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot className="sticky bottom-0" style={{ background: 'var(--sgo-panel-2)' }}>
            <tr style={{ borderTop: '2px solid var(--sgo-hair-2)' }}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn('font-semibold', c.numeric && 'r', c.hideOnMobile && 'hidden md:table-cell')}
                  style={{ color: 'var(--sgo-ink)' }}
                >
                  {footer[c.key] ?? null}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
