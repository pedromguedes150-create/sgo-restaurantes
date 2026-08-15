import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getUsageBoard } from '@/lib/supervisor/usage';
import { getMetaBreakdown } from '@/lib/metas/query';
import { Card, CardContent } from '@/components/ui/card';
import { PrintButton } from '@/components/ui/print-button';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import { FormSelect } from '@/components/ui/ds/form-controls';
import { shortUnitName } from '@/lib/unit-name';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function tone(pct: number): string { return pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger'; }
function toneBg(pct: number): string { return pct >= 80 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-danger'; }

/** Painel resumo da unidade para a reunião supervisor×gerente (20/07). Imprimível. */
export default async function PainelUnidadePage({ searchParams }: { searchParams: { unit?: string; mes?: string } }) {
  const user = (await getSessionUser())!;
  if (!['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role)) {
    return <p className="text-sm text-ink-500">Restrito à Supervisão/Administração.</p>;
  }
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade no escopo.</p>;

  const now = new Date();
  const ym = /^\d{4}-\d{2}$/.test(searchParams.mes ?? '') ? searchParams.mes! : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const selUnit = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const [y, m] = ym.split('-').map(Number);

  const [board, breakdown, taskCounts, occ] = await Promise.all([
    getUsageBoard(user, ym),
    getMetaBreakdown(selUnit.id, ym),
    prisma.taskInstance.groupBy({ by: ['status'], where: { unitId: selUnit.id, operationalDate: { startsWith: ym }, status: { in: ['DONE', 'LATE', 'MISSED'] } }, _count: true }),
    prisma.occurrence.groupBy({ by: ['status'], where: { unitId: selUnit.id, operationalDate: { startsWith: ym } }, _count: true }),
  ]);
  const row = board.find((r) => r.unitId === selUnit.id);
  const cnt = (s: string) => taskCounts.find((t) => t.status === s)?._count ?? 0;
  const done = cnt('DONE'), late = cnt('LATE'), missed = cnt('MISSED');
  const occOpen = (occ.find((o) => o.status === 'OPEN')?._count ?? 0) + (occ.find((o) => o.status === 'IN_PROGRESS')?._count ?? 0);
  const occTotal = occ.reduce((s, o) => s + o._count, 0);

  const months: string[] = [];
  for (let i = 0; i < 12; i++) { const d = new Date(y, (m - 1) - i, 1); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/modulos/supervisao" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Supervisão</Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LargeTitle title="Painel da unidade" />
        <PrintButton />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3 print:hidden">
        <FormSelect
          name="unit" label="Unidade" defaultValue={selUnit.id} className="w-52"
          options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))}
        />
        <FormSelect
          name="mes" label="Mês" defaultValue={ym} className="w-44"
          options={months.map((mm) => { const [yy, m2] = mm.split('-'); return { value: mm, label: `${MONTHS[Number(m2) - 1]}/${yy}` }; })}
        />
        <button type="submit" className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand">Ver</button>
      </form>

      <div className="rounded-xl border bg-surface p-4">
        <p className="text-lg font-bold text-brand">{selUnit.name}</p>
        <p className="text-sm text-ink-500">Resumo de {MONTHS[m - 1]}/{y} · gerado em {now.toLocaleDateString('pt-BR')}</p>
      </div>

      {/* Performance */}
      <Card><CardContent className="pt-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">Performance na plataforma</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Meta do mês" pct={row?.metaPct ?? 0} />
          <Kpi label="Uso diário" pct={row?.usagePct ?? 0} />
          <Kpi label="Checklists" pct={row?.checklistPct ?? 0} />
          <Kpi label="Desperdício (cobertura)" pct={row?.wastePct ?? 0} />
        </div>
      </CardContent></Card>

      {/* Preenchimento operacional */}
      <Card><CardContent className="pt-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">Preenchimento operacional</h2>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Stat label="Checklists concluídos" value={`${done}`} sub={`${late} fora do prazo · ${missed} não realizados`} />
          <Stat label="Comandas (cobertura)" value={`${row?.commandsPct ?? 0}%`} />
          <Stat label="Desperdício (cobertura)" value={`${row?.wastePct ?? 0}%`} />
          <Stat label="Notas recebidas" value={`${row?.notes ?? 0}`} />
          <Stat label="Movimentos do cofre" value={`${row?.cashSessions ?? 0}`} />
          <Stat label="Ocorrências" value={`${occTotal}`} sub={`${occOpen} em aberto`} />
        </div>
      </CardContent></Card>

      {/* Detalhamento da meta */}
      <Card><CardContent className="pt-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">Histórico de checklists / componentes da meta</h2>
        {breakdown.length === 0 && <p className="text-sm text-ink-500">Sem componentes no período.</p>}
        <div className="space-y-1.5">
          {breakdown.map((b, i) => (
            <div key={i} className="flex items-center justify-between gap-2 border-b pb-1.5 text-sm">
              <span className="min-w-0"><span className="block font-medium text-brand">{b.name}</span><span className="block text-xs text-ink-500">{b.done}/{b.resolved} realizadas</span></span>
              <span className={`shrink-0 font-bold tabular-nums ${tone(b.scorePct)}`}>{b.scorePct}%<span className="ml-1 text-xs font-normal text-ink-500">peso {b.weight}</span></span>
            </div>
          ))}
        </div>
      </CardContent></Card>

      <p className="text-center text-xs text-ink-500 print:mt-6">SGO Beija Flor · Painel da unidade · {selUnit.name} · {MONTHS[m - 1]}/{y}</p>
    </div>
  );
}

function Kpi({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <p className={`text-2xl font-black ${tone(pct)}`}>{pct}%</p>
      <p className="text-xs text-ink-500">{label}</p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sunken"><div className={`h-full rounded-full ${toneBg(pct)}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-lg font-bold text-brand">{value}</p>
      <p className="text-xs text-ink-500">{label}</p>
      {sub && <p className="text-[11px] text-ink-500">{sub}</p>}
    </div>
  );
}
