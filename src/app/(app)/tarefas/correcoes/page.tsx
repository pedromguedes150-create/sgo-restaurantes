import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { parseUnitParam } from '@/lib/scope/unit-param';
import { getCorrectionsReport, type CorrectionItem } from '@/lib/tasks/corrections';
import { currentOperationalDate } from '@/lib/date/operational';
import { Card, CardContent } from '@/components/ui/card';
import { PrintButton } from '@/components/ui/print-button';
import { UnitFilter } from '@/components/ui/unit-filter';
import { ArrowLeft } from 'lucide-react';
import { FormDatePicker } from '@/components/ui/ds/form-controls';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

function fmtBR(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

export default async function CorrecoesPage({ searchParams }: { searchParams: { unit?: string; from?: string; to?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true, timezone: true, cutoffHour: true } });
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade vinculada.</p>;

  const unitFilter = parseUnitParam(searchParams.unit, units.map((u) => u.id));
  const ref = units[0];
  const today = currentOperationalDate({ timezone: ref.timezone, cutoffHour: ref.cutoffHour });
  const to = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.to ?? '') ? searchParams.to! : today;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.from ?? '') ? searchParams.from! : to;

  const report = await getCorrectionsReport(user, unitFilter.ids, from, to);
  const multi = units.length > 1;
  const showMeta = (it: CorrectionItem) => `${it.checklist}${multi ? ` · ${it.unit}` : ''} · ${fmtBR(it.operationalDate)}${it.by ? ` · ${it.by}` : ''}${it.time ? ` · ${it.time}` : ''}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/tarefas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Tarefas</Link>
        <PrintButton label="Imprimir / PDF" />
      </div>
      <LargeTitle title="Relatório de correções" subtitle="Itens marcados como 🟡 Em correção e 🔴 A corrigir nos checklists. Escolha o período e as unidades." />

      <div className="space-y-2 print:hidden">
        {multi && <UnitFilter units={units.map((u) => ({ id: u.id, name: u.name }))} selected={unitFilter.all ? [] : unitFilter.ids} />}
        <form className="flex flex-wrap items-end gap-2">
          {!unitFilter.all && <input type="hidden" name="unit" value={unitFilter.ids.join(',')} />}
          <FormDatePicker name="from" label="De" size="sm" defaultValue={from} max={to} className="w-36" />
          <FormDatePicker name="to" label="Até" size="sm" defaultValue={to} min={from} className="w-36" />
          <button className="h-9 rounded-lg border px-3 text-sm font-semibold hover:border-brand">Ver</button>
        </form>
      </div>

      <p className="text-sm font-semibold text-brand">
        {unitFilter.all ? 'Todas as unidades' : `${unitFilter.ids.length} unidade(s)`} · {from === to ? fmtBR(from) : `${fmtBR(from)} a ${fmtBR(to)}`}
      </p>

      {report.total === 0 ? (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">Nenhum item em correção ou a corrigir no período. 🎉</p>
      ) : (
        <>
          <Section title="🔴 A corrigir" items={report.aCorrigir} tone="critical" meta={showMeta} />
          <Section title="🟡 Em correção" items={report.emCorrecao} tone="medium" meta={showMeta} />
        </>
      )}
    </div>
  );
}

function Section({ title, items, tone, meta }: { title: string; items: CorrectionItem[]; tone: 'critical' | 'medium'; meta: (it: CorrectionItem) => string }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardContent className="space-y-1.5 pt-4">
        <p className={`text-sm font-bold ${tone === 'critical' ? 'text-danger' : 'text-warning'}`}>{title} ({items.length})</p>
        {items.map((it, i) => (
          <div key={i} className="rounded-lg border bg-surface p-2.5 text-sm">
            <p className="font-medium text-brand">{it.text}</p>
            {it.note && <p className="text-xs text-ink-500">Obs.: {it.note}</p>}
            <p className="text-[11px] text-ink-500">{meta(it)}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
