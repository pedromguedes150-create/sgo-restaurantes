'use client';

import { useRouter } from 'next/navigation';
import { Printer } from 'lucide-react';
import { Button as DsButton } from '@/components/ui/ds/button';
import { Select } from '@/components/ui/ds/select';
import { StatCard } from '@/components/ui/ds/stat-card';
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
const TONE = { success: 'bg-success', medium: 'bg-warning', critical: 'bg-danger' } as const;
const pctCls = (v: number) => (v >= 80 ? 'text-success' : v >= 50 ? 'text-warning' : 'text-danger');

export function ExecutiveClient({ rows, totals, yearMonth, months }: {
  rows: ExecRowUI[]; totals: ExecTotalsUI; yearMonth: string; months: string[];
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <div className="w-52">
          <Select
            aria-label="Mês"
            options={months.map((m) => ({ value: m, label: fmtMonthLong(m) }))}
            value={yearMonth}
            onValueChange={(m) => router.push(`/modulos/executivo?mes=${m}`)}
          />
        </div>
        <DsButton size="sm" variant="secondary" className="ml-auto" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir / PDF</DsButton>
      </div>

      <p className="hidden text-sm font-semibold capitalize print:block">Visão Executiva — {fmtMonthLong(yearMonth)}</p>

      {/* Os 4 números que dizem se o mês foi bom. Os demais totais ficam no
          rodapé da tabela, junto da coluna que já os detalha por unidade —
          antes eram 8 cartões, metade repetindo coluna. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Meta média da rede" value={`${totals.metaAvg}%`} />
        <StatCard label="Uso médio do sistema" value={`${totals.usageAvg}%`} />
        <StatCard label="Desperdício total" value={`${totals.wasteKg.toLocaleString('pt-BR')} kg`} />
        <StatCard
          label="Ocorrências graves"
          value={totals.severeOccurrences}
          hint={totals.severeOccurrences > 0 ? 'exigem tratativa' : 'nenhuma no mês'}
        />
      </div>

      {/* Tabela por unidade */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-canvas text-left text-xs uppercase tracking-wide text-ink-500">
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
                <td className={cn('p-2 text-right tabular-nums', r.cashDivergent > 0 && 'font-semibold text-danger')}>{r.cashDivergent > 0 ? `${r.cashDivergent} · ${brl(r.cashDivergenceTotal)}` : '—'}</td>
                <td className="p-2 text-right tabular-nums">{r.maintenanceCost > 0 ? brl(r.maintenanceCost) : '—'}{r.maintenanceOpen > 0 ? ` (${r.maintenanceOpen} aberto)` : ''}</td>
                <td className={cn('p-2 text-right tabular-nums', r.severeOccurrences > 0 && 'font-semibold text-danger')}>{r.severeOccurrences || '—'}</td>
                <td className="p-2 text-right tabular-nums">{r.visitsDone || '—'}</td>
              </tr>
            ))}
          </tbody>
          {/* Totais da rede: mesma coluna que detalha por unidade. */}
          <tfoot>
            <tr className="border-t-2 border-line-strong font-semibold">
              <td className="p-2 text-ink-900">Rede</td>
              <td className="p-2 text-right tabular-nums text-ink-900">{totals.metaAvg}%</td>
              <td className="p-2 text-right tabular-nums text-ink-900">{totals.usageAvg}%</td>
              <td className="p-2 text-right tabular-nums text-ink-900">{totals.wasteKg.toLocaleString('pt-BR')} kg</td>
              <td className="p-2 text-right tabular-nums text-ink-900">{totals.certDays > 0 ? `${totals.certDays}d` : '—'}</td>
              <td className={cn('p-2 text-right tabular-nums', totals.cashDivergent > 0 ? 'text-danger' : 'text-ink-900')}>
                {totals.cashDivergent > 0 ? `${totals.cashDivergent} · ${brl(totals.cashDivergenceTotal)}` : '—'}
              </td>
              <td className="p-2 text-right tabular-nums text-ink-900">{totals.maintenanceCost > 0 ? brl(totals.maintenanceCost) : '—'}</td>
              <td className={cn('p-2 text-right tabular-nums', totals.severeOccurrences > 0 ? 'text-danger' : 'text-ink-900')}>{totals.severeOccurrences || '—'}</td>
              <td className="p-2 text-right tabular-nums text-ink-900">{totals.visitsDone || '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[12px] text-ink-500 print:hidden">
        Ordenado pela meta. A bolinha indica o uso do sistema: verde ≥80%, âmbar ≥50%, vermelho abaixo de 50%. Absenteísmo = dias de atestado ÷ (headcount × dias do mês). Detalhes nos módulos.
      </p>
    </div>
  );
}
