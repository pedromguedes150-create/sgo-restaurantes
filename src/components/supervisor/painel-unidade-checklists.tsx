'use client';

import { useState } from 'react';
import type { MetaTaskRow } from '@/lib/metas/query';

/**
 * Checklists da visão UNIDADE: resumo ANTES do detalhe.
 * A lista completa (que já existia) não carrega de cara — primeiro o resumo e
 * os checklists que exigem atenção; "Ver todos" abre a listagem inteira.
 */

function tone(p: number) { return p >= 80 ? 'text-success' : p >= 50 ? 'text-warning' : 'text-danger'; }
const ATENCAO = 5; // quantos "exigem atenção" mostrar de início (piores)

export function PainelUnidadeChecklists({ breakdown, done, late, missed }: {
  breakdown: MetaTaskRow[]; done: number; late: number; missed: number;
}) {
  const [verTodos, setVerTodos] = useState(false);
  const total = done + late + missed;
  const p = (parte: number) => (total === 0 ? 0 : Math.round((parte / total) * 100));

  const piores = [...breakdown].sort((a, b) => a.scorePct - b.scorePct).slice(0, ATENCAO);
  const lista = verTodos ? breakdown : piores;

  const Linha = ({ b }: { b: MetaTaskRow }) => (
    <div className="flex items-center justify-between gap-2 border-b border-line pb-1.5 last:border-b-0 sgo-type-13">
      <span className="min-w-0">
        <span className="block font-medium text-ink-900">{b.name}</span>
        <span className="block sgo-type-11 text-ink-500">{b.done}/{b.resolved} realizadas</span>
      </span>
      <span className={`shrink-0 font-bold tabular-nums ${tone(b.scorePct)}`}>{b.scorePct}%<span className="ml-1 sgo-type-11 font-normal text-ink-500">peso {b.weight}</span></span>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Resumo */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-card border border-line bg-surface p-2.5"><p className="sgo-type-24 font-bold tabular-nums text-ink-900">{done + late}</p><p className="sgo-type-11 text-ink-500">Realizados</p></div>
        <div className="rounded-card border border-line bg-surface p-2.5"><p className={`sgo-type-24 font-bold tabular-nums ${tone(p(done))}`}>{p(done)}%</p><p className="sgo-type-11 text-ink-500">No prazo</p></div>
        <div className="rounded-card border border-line bg-surface p-2.5"><p className={`sgo-type-24 font-bold tabular-nums ${late > 0 ? 'text-warning' : 'text-ink-900'}`}>{p(late)}%</p><p className="sgo-type-11 text-ink-500">Fora do prazo</p></div>
        <div className="rounded-card border border-line bg-surface p-2.5"><p className={`sgo-type-24 font-bold tabular-nums ${missed > 0 ? 'text-danger' : 'text-ink-900'}`}>{missed}</p><p className="sgo-type-11 text-ink-500">Não realizados</p></div>
        <div className="rounded-card border border-line bg-surface p-2.5"><p className={`sgo-type-24 font-bold tabular-nums ${tone(p(done + late))}`}>{p(done + late)}%</p><p className="sgo-type-11 text-ink-500">Taxa de execução</p></div>
      </div>

      {breakdown.length === 0 ? (
        <p className="sgo-type-13 text-ink-500">Sem componentes no período.</p>
      ) : (
        <>
          <p className="sgo-type-11 font-semibold uppercase tracking-wide text-ink-500">{verTodos ? 'Todos os checklists' : 'Checklists que exigem atenção'}</p>
          <div className="space-y-1.5">{lista.map((b, i) => <Linha key={i} b={b} />)}</div>
          {breakdown.length > ATENCAO && (
            <button type="button" onClick={() => setVerTodos((v) => !v)} className="sgo-type-13 font-semibold text-brand hover:underline print:hidden">
              {verTodos ? 'Mostrar só os que exigem atenção' : `Ver todos os checklists (${breakdown.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
