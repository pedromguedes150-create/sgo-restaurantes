'use client';

import { useMemo, useState } from 'react';

interface UnitCol { id: string; name: string; code: string }
interface Row { name: string; module: string; unitIds: string[] }

/**
 * Matriz checklist × unidade (20/07): mostra rapidamente quais checklists estão
 * habilitados em cada unidade. Célula âmbar = checklist comum (na maioria das
 * unidades) que FALTA nesta — ajuda o supervisor a achar buracos.
 */
export function ChecklistCoverageMatrix({ units, rows }: { units: UnitCol[]; rows: Row[] }) {
  const [q, setQ] = useState('');
  const [onlyGaps, setOnlyGaps] = useState(false);

  const half = Math.ceil(units.length / 2);
  const enriched = useMemo(() => rows.map((r) => {
    const set = new Set(r.unitIds);
    const common = set.size >= half; // habilitado na maioria → falta em quem não tem é suspeita
    const gaps = units.filter((u) => !set.has(u.id)).length;
    return { ...r, set, common, gaps };
  }), [rows, units, half]);

  const filtered = useMemo(() => enriched.filter((r) =>
    (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())) &&
    (!onlyGaps || (r.common && r.gaps > 0)),
  ), [enriched, q, onlyGaps]);

  const perUnitCount = useMemo(() => units.map((u) => ({ id: u.id, n: rows.filter((r) => r.unitIds.includes(u.id)).length })), [units, rows]);

  if (rows.length === 0) return <p className="text-sm text-ink-500">Nenhum checklist ativo cadastrado.</p>;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-sgo-brand">Resumo: checklists habilitados por unidade</h2>
        <p className="text-xs text-ink-500">✓ = habilitado. Célula <span className="font-semibold text-warning">âmbar</span> = checklist presente na maioria das unidades mas <b>faltando</b> nesta (possível esquecimento).</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar checklist…" className="h-9 w-48 rounded-lg border-2 border-line-strong bg-sgo-surface px-3 text-sm" />
        <label className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
          <input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} /> só possíveis faltas
        </label>
        <span className="ml-auto text-xs text-ink-500">{filtered.length} de {rows.length} checklist(s)</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-sgo-surface p-2 text-left font-bold text-ink-500">Checklist</th>
              {units.map((u) => (
                <th key={u.id} className="p-1 text-center font-semibold text-ink-500" title={u.name}>
                  <span className="block max-w-[3.5rem] truncate">{u.code || u.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.name} className="border-t">
                <td className="sticky left-0 z-10 bg-sgo-surface p-2 font-medium text-sgo-brand">
                  {r.name}
                  {r.common && r.gaps > 0 && <span className="ml-1 rounded-full bg-warning-bg px-1.5 py-0.5 text-[10px] font-semibold text-warning">falta em {r.gaps}</span>}
                </td>
                {units.map((u) => {
                  const has = r.set.has(u.id);
                  const gap = !has && r.common;
                  return (
                    <td key={u.id} className={`p-1 text-center ${has ? 'bg-sgo-success/70 font-bold text-white' : gap ? 'bg-warning/40 text-warning' : 'text-ink-500'}`} title={`${r.name} · ${u.name}`}>
                      {has ? '✓' : gap ? '!' : '·'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2">
              <td className="sticky left-0 z-10 bg-sgo-surface p-2 text-right font-bold text-ink-500">Total por unidade</td>
              {units.map((u) => {
                const n = perUnitCount.find((x) => x.id === u.id)?.n ?? 0;
                return <td key={u.id} className="p-1 text-center font-bold text-sgo-brand">{n}</td>;
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
