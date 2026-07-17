'use client';

import { useRouter } from 'next/navigation';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ExecRowUI {
  unitId: string; unitName: string; metaPct: number; usagePct: number; usageTone: 'success' | 'medium' | 'critical';
  wasteKg: number; absenteeismPct: number; certDays: number; cashDivergent: number; cashDivergenceTotal: number;
  maintenanceCost: number; maintenanceOpen: number; severeOccurrences: number; visitsDone: number;
}
export interface ExecTotalsUI {
  metaAvg: number; usageAvg: number; wasteKg: number; certDays: number;
  cashDivergent: number; cashDivergenceTotal: number; maintenanceCost: number; severeOccurrences: number; visitsDone: number;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtMonthLong = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};
const TONE = { success: 'bg-success', medium: 'bg-medium', critical: 'bg-critical' } as const;
const pctCls = (v: number) => (v >= 80 ? 'text-success' : v >= 50 ? 'text-[#92600A]' : 'text-critical');

export function ExecutiveClient({ rows, totals, yearMonth, months }: {
  rows: ExecRowUI[]; totals: ExecTotalsUI; yearMonth: string; months: string[];
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select value={yearMonth} onChange={(e) => router.push(`/modulos/executivo?mes=${e.target.value}`)} className="h-9 rounded-md border bg-card px-2 text-sm font-semibold capitalize">
          {months.map((m) => <option key={m} value={m}>{fmtMonthLong(m)}</option>)}
        </select>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir / PDF</Button>
      </div>

      <p className="hidden text-sm font-semibold capitalize print:block">Visão Executiva — {fmtMonthLong(yearMonth)}</p>

      {/* Cartões da rede */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([
          ['Meta média da rede', `${totals.metaAvg}%`, pctCls(totals.metaAvg)],
          ['Uso médio do sistema', `${totals.usageAvg}%`, pctCls(totals.usageAvg)],
          ['Desperdício total', `${totals.wasteKg.toLocaleString('pt-BR')} kg`, ''],
          ['Dias de atestado', String(totals.certDays), ''],
          ['Retiradas do troco (proibidas)', `${totals.cashDivergent} (${brl(totals.cashDivergenceTotal)})`, totals.cashDivergent > 0 ? 'text-critical' : 'text-success'],
          ['Custo de manutenção', brl(totals.maintenanceCost), ''],
          ['Ocorrências graves', String(totals.severeOccurrences), totals.severeOccurrences > 0 ? 'text-critical' : 'text-success'],
          ['Visitas de supervisão', String(totals.visitsDone), ''],
        ] as const).map(([label, val, cls]) => (
          <div key={label} className="rounded-lg border bg-card p-2.5">
            <p className={cn('text-base font-bold tabular-nums', cls)}>{val}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabela por unidade */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="p-2">Unidade</th>
              <th className="p-2 text-right">Meta</th>
              <th className="p-2 text-right">Uso</th>
              <th className="p-2 text-right">Desperdício</th>
              <th className="p-2 text-right">Absent.</th>
              <th className="p-2 text-right">Troco (retiradas)</th>
              <th className="p-2 text-right">Manutenção</th>
              <th className="p-2 text-right">Ocorr. graves</th>
              <th className="p-2 text-right">Visitas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.unitId} className="border-t">
                <td className="p-2 font-semibold text-brand">
                  <span className="flex items-center gap-1.5"><span className={cn('h-2 w-2 shrink-0 rounded-full', TONE[r.usageTone])} />{r.unitName}</span>
                </td>
                <td className={cn('p-2 text-right font-bold tabular-nums', pctCls(r.metaPct))}>{r.metaPct}%</td>
                <td className={cn('p-2 text-right tabular-nums', pctCls(r.usagePct))}>{r.usagePct}%</td>
                <td className="p-2 text-right tabular-nums">{r.wasteKg.toLocaleString('pt-BR')} kg</td>
                <td className="p-2 text-right tabular-nums">{r.absenteeismPct.toLocaleString('pt-BR')}%{r.certDays > 0 ? ` (${r.certDays}d)` : ''}</td>
                <td className={cn('p-2 text-right tabular-nums', r.cashDivergent > 0 && 'font-semibold text-critical')}>{r.cashDivergent > 0 ? `${r.cashDivergent} · ${brl(r.cashDivergenceTotal)}` : '—'}</td>
                <td className="p-2 text-right tabular-nums">{r.maintenanceCost > 0 ? brl(r.maintenanceCost) : '—'}{r.maintenanceOpen > 0 ? ` (${r.maintenanceOpen} aberto)` : ''}</td>
                <td className={cn('p-2 text-right tabular-nums', r.severeOccurrences > 0 && 'font-semibold text-critical')}>{r.severeOccurrences || '—'}</td>
                <td className="p-2 text-right tabular-nums">{r.visitsDone || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground print:hidden">
        Ordenado pela meta. Bolinha = uso do sistema (🟢 ≥80% · 🟡 ≥50% · 🔴 &lt;50%). Absenteísmo = dias de atestado ÷ (headcount × dias do mês). Detalhes nos módulos.
      </p>
    </div>
  );
}
