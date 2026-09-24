import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getUsageBoard } from '@/lib/supervisor/usage';
import { getPainelRede } from '@/lib/supervisor/rede';
import { getMetaBreakdown } from '@/lib/metas/query';
import { Card, CardContent } from '@/components/ui/card';
import { PrintButton } from '@/components/ui/print-button';
import { ArrowLeft } from 'lucide-react';
import { FormSelect } from '@/components/ui/ds/form-controls';
import { shortUnitName } from '@/lib/unit-name';
import { LargeTitle } from '@/components/layout/page-chrome';
import { PainelRedeClient } from '@/components/supervisor/painel-rede-client';
import { PainelUnidadeChecklists } from '@/components/supervisor/painel-unidade-checklists';

export const dynamic = 'force-dynamic';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function tone(pct: number): string { return pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger'; }
function toneBg(pct: number): string { return pct >= 80 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-danger'; }

/**
 * PAINEL DA SUPERVISÃO. Um seletor no topo: REDE GERAL (visão executiva da
 * diretoria) ou UNIDADE (detalhamento). A visão da rede COMPÕE os números que a
 * visão da unidade já mostra — nada é recalculado (`getPainelRede`).
 */
export default async function PainelUnidadePage({ searchParams }: { searchParams: { unit?: string; mes?: string; visao?: string } }) {
  const user = (await getSessionUser())!;
  if (!['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role)) {
    return <p className="text-sm text-ink-500">Restrito à Supervisão/Administração.</p>;
  }
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade no escopo.</p>;

  const now = new Date();
  const ym = /^\d{4}-\d{2}$/.test(searchParams.mes ?? '') ? searchParams.mes! : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [y, m] = ym.split('-').map(Number);
  /* Rede por padrão quando há mais de uma unidade — é a pergunta da diretoria. */
  const visao = searchParams.visao === 'unidade' || units.length === 1 ? 'unidade' : 'rede';

  const months: string[] = [];
  for (let i = 0; i < 12; i++) { const d = new Date(y, (m - 1) - i, 1); months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const mesOptions = months.map((mm) => { const [yy, m2] = mm.split('-'); return { value: mm, label: `${MONTHS[Number(m2) - 1]}/${yy}` }; });

  const toggle = (
    <div className="inline-flex overflow-hidden rounded-control border border-line print:hidden">
      <Link href={`/modulos/painel-unidade?visao=rede&mes=${ym}`} className={`px-3 py-1.5 sgo-type-13 font-semibold ${visao === 'rede' ? 'bg-brand text-on-brand' : 'bg-surface text-ink-700 hover:bg-sunken'}`}>Rede geral</Link>
      <Link href={`/modulos/painel-unidade?visao=unidade&mes=${ym}${searchParams.unit ? `&unit=${searchParams.unit}` : ''}`} className={`px-3 py-1.5 sgo-type-13 font-semibold ${visao === 'unidade' ? 'bg-brand text-on-brand' : 'bg-surface text-ink-700 hover:bg-sunken'}`}>Unidade</Link>
    </div>
  );

  const header = (
    <>
      <div className="print:hidden">
        <Link href="/modulos/supervisao" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Supervisão</Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LargeTitle title={visao === 'rede' ? 'Painel executivo da rede' : 'Painel da unidade'} />
        <div className="flex flex-wrap items-center gap-2">{toggle}<PrintButton /></div>
      </div>
    </>
  );

  /* ───────────────────────── REDE GERAL ───────────────────────── */
  if (visao === 'rede') {
    const dados = await getPainelRede(user, ym);
    return (
      <div className="space-y-4">
        {header}
        <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3 print:hidden">
          <input type="hidden" name="visao" value="rede" />
          <FormSelect name="mes" label="Mês" defaultValue={ym} className="w-44" options={mesOptions} />
          <button type="submit" className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand">Ver</button>
        </form>
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-lg font-bold text-ink-900">Consolidado da rede</p>
          <p className="text-sm text-ink-500">{dados.resumo.unidades} unidade(s) · {MONTHS[m - 1]}/{y} · gerado em {now.toLocaleDateString('pt-BR')}</p>
        </div>
        <PainelRedeClient dados={dados} ym={ym} />
        <p className="text-center text-xs text-ink-500 print:mt-6">SGO Beija Flor · Painel executivo da rede · {MONTHS[m - 1]}/{y}</p>
      </div>
    );
  }

  /* ───────────────────────── UNIDADE ───────────────────────── */
  const selUnit = units.find((u) => u.id === searchParams.unit) ?? units[0];
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

  return (
    <div className="space-y-4">
      {header}
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3 print:hidden">
        <input type="hidden" name="visao" value="unidade" />
        <FormSelect name="unit" label="Unidade" defaultValue={selUnit.id} className="w-52" options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
        <FormSelect name="mes" label="Mês" defaultValue={ym} className="w-44" options={mesOptions} />
        <button type="submit" className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand">Ver</button>
      </form>

      <div className="rounded-card border border-line bg-surface p-4">
        <p className="text-lg font-bold text-ink-900">{selUnit.name}</p>
        <p className="text-sm text-ink-500">Resumo de {MONTHS[m - 1]}/{y} · gerado em {now.toLocaleDateString('pt-BR')}</p>
      </div>

      <Card><CardContent className="pt-4">
        <h2 className="mb-3 sgo-type-11 font-semibold text-ink-900">Performance na plataforma</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Meta do mês" pct={row?.metaPct ?? 0} />
          <Kpi label="Uso diário" pct={row?.usagePct ?? 0} />
          <Kpi label="Checklists" pct={row?.checklistPct ?? 0} />
          <Kpi label="Desperdício (cobertura)" pct={row?.wastePct ?? 0} />
        </div>
      </CardContent></Card>

      <Card><CardContent className="pt-4">
        <h2 className="mb-3 sgo-type-11 font-semibold text-ink-900">Preenchimento operacional</h2>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Stat label="Checklists concluídos" value={`${done}`} sub={`${late} fora do prazo · ${missed} não realizados`} />
          <Stat label="Comandas (cobertura)" value={`${row?.commandsPct ?? 0}%`} />
          <Stat label="Desperdício (cobertura)" value={`${row?.wastePct ?? 0}%`} />
          <Stat label="Notas recebidas" value={`${row?.notes ?? 0}`} />
          <Stat label="Movimentos do cofre" value={`${row?.cashSessions ?? 0}`} />
          <Stat label="Ocorrências" value={`${occTotal}`} sub={`${occOpen} em aberto`} />
        </div>
      </CardContent></Card>

      <Card><CardContent className="pt-4">
        <h2 className="mb-3 sgo-type-11 font-semibold text-ink-900">Checklists / componentes da meta</h2>
        <PainelUnidadeChecklists breakdown={breakdown} done={done} late={late} missed={missed} />
      </CardContent></Card>

      <p className="text-center text-xs text-ink-500 print:mt-6">SGO Beija Flor · Painel da unidade · {selUnit.name} · {MONTHS[m - 1]}/{y}</p>
    </div>
  );
}

function Kpi({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <p className={`sgo-type-24 font-semibold ${tone(pct)}`}>{pct}%</p>
      <p className="text-xs text-ink-500">{label}</p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sunken"><div className={`h-full rounded-full ${toneBg(pct)}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="sgo-type-24 font-semibold text-ink-900">{value}</p>
      <p className="text-xs text-ink-500">{label}</p>
      {sub && <p className="text-[11px] text-ink-500">{sub}</p>}
    </div>
  );
}
