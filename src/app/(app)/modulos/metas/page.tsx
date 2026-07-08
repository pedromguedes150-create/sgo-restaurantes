import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getMetaBreakdown, getMetaRanking } from '@/lib/metas/query';
import { getUnitMonthScore } from '@/lib/tasks/summary';
import { getLateEntryPenaltyPct } from '@/lib/late-entry';
import { LateEntryConfig } from '@/components/metas/late-entry-config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PrintButton } from '@/components/ui/print-button';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { Trophy, Download } from 'lucide-react';

export const dynamic = 'force-dynamic';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
function lastMonths(n: number): { value: string; label: string }[] {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1));
    out.push({ value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[d.getUTCMonth()]}/${d.getUTCFullYear()}` });
  }
  return out;
}

export default async function MetasPage({ searchParams }: { searchParams: { unit?: string; month?: string } }) {
  const user = (await getSessionUser())!;
  const months = lastMonths(12);
  const ym = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : months[0].value;
  const monthLabel = months.find((m) => m.value === ym)?.label ?? ym;

  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' } });
  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];

  const isAdminView = user.seesAllUnits || user.role === 'SUPERVISOR';
  const ranking = isAdminView ? await getMetaRanking(user, ym) : [];
  const breakdown = selected ? await getMetaBreakdown(selected.id, ym) : [];
  const score = selected ? await getUnitMonthScore(selected.id, ym) : null;
  const lateEntryPct = user.role === 'ADMIN' ? await getLateEntryPenaltyPct() : null;

  const linkFor = (p: Record<string, string>) => {
    const sp = new URLSearchParams({ month: ym, ...(selected ? { unit: selected.id } : {}), ...p });
    return `/modulos/metas?${sp.toString()}`;
  };
  const exportHref = `/api/metas/export?month=${ym}${selected ? `&unit=${selected.id}` : ''}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-brand">Metas e Performance</h1>
        <div className="flex gap-2 print:hidden">
          <a href={exportHref} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-accent"><Download className="h-4 w-4" /> Excel</a>
          <PrintButton label="PDF" />
        </div>
      </div>

      {lateEntryPct != null && <LateEntryConfig current={lateEntryPct} />}
      <p className="text-sm text-muted-foreground">Mês {monthLabel}</p>

      {/* Histórico: seletor de mês (lista suspensa) */}
      <div className="max-w-xs print:hidden">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mês de referência</p>
        <UnitSelectNav units={months.map((m) => ({ id: m.value, name: m.label }))} selected={ym} paramName="month" />
      </div>

      {isAdminView && ranking.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-accent" /> Ranking de metas</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {ranking.map((r, i) => (
              <div key={r.unitId} className="flex justify-between text-sm">
                <span>{i + 1}. {r.name}</span>
                <span className="font-bold text-brand">{r.scorePct}%</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {units.length > 1 && <UnitSelectNav units={units} selected={selected?.id ?? ''} />}

      {selected && score && (
        <Card>
          <CardHeader><CardTitle>{isAdminView ? selected.name : 'Minha Meta do Mês'} — {score.scorePct}%</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-accent" style={{ width: `${score.scorePct}%` }} />
            </div>
            <div className="space-y-2">
              {breakdown.length === 0 && <p className="text-sm text-muted-foreground">Sem tarefas resolvidas no mês ainda.</p>}
              {breakdown.map((t) => (
                <div key={t.name}>
                  <div className="flex justify-between text-sm">
                    <span>{t.name} <span className="text-xs text-muted-foreground">(peso {t.weight})</span></span>
                    <span className="font-semibold">{t.done}/{t.resolved} · {t.scorePct}%</span>
                  </div>
                  <div className="mt-0.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-success" style={{ width: `${t.scorePct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
