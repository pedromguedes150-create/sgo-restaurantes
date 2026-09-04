import { getSessionUser } from '@/lib/auth/session';
import { permissaoDeRota } from '@/lib/permissions/links';

import { FamilyTabs } from '@/components/layout/family-tabs';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getMetaBreakdown, getMetaRanking } from '@/lib/metas/query';
import { getUnitMonthScore } from '@/lib/tasks/summary';
import { getLateEntryPenaltyPct } from '@/lib/late-entry';
import { LateEntryConfig } from '@/components/metas/late-entry-config';
import { PrintButton } from '@/components/ui/print-button';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Button as DsButton } from '@/components/ui/ds/button';
import { List, ListRow } from '@/components/ui/ds/list-row';
import { ProgressBar } from '@/components/ui/ds/progress-bar';
import { shortUnitName } from '@/lib/unit-name';
import { Trophy, Download, Settings } from 'lucide-react';

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
  const podeVer = await permissaoDeRota(user.role);
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
      <LargeTitle
        title="Metas e Performance"
        subtitle={`Mês ${monthLabel}`}
        actions={
          <div className="flex gap-2 print:hidden">
            <a href={exportHref}><DsButton size="sm" variant="secondary"><Download className="h-4 w-4" /> Excel</DsButton></a>
            <PrintButton label="PDF" />
      <FamilyTabs active="/modulos/metas" />
          </div>
        }
      />

      {(user.role === 'ADMIN' || user.role === 'SUPERVISOR') && podeVer('/modulos/metas/config') && (
        <div className="print:hidden">
          <List>
            <ListRow
              href="/modulos/metas/config"
              leading={<Settings className="h-8 w-8 shrink-0 rounded-control bg-sunken p-2 text-ink-500" />}
              title="Configuração da Meta"
              subtitle="Todos os componentes e seus pesos"
            />
          </List>
        </div>
      )}
      {lateEntryPct != null && <LateEntryConfig current={lateEntryPct} />}

      {/* Mês de referência (histórico) */}
      <div className="max-w-xs print:hidden">
        <p className="sgo-type-11 mb-1 text-ink-500">Mês de referência</p>
        <UnitSelectNav units={months.map((m) => ({ id: m.value, name: m.label }))} selected={ym} paramName="month" />
      </div>

      {isAdminView && ranking.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Trophy className="h-4 w-4 text-ink-400" aria-hidden /> Ranking de metas
          </h2>
          <List>
            {ranking.map((r, i) => (
              <ListRow
                key={r.unitId}
                leading={
                  <span className="flex h-7 w-7 items-center justify-center rounded-pill bg-sunken text-xs font-bold tabular-nums text-ink-700">{i + 1}</span>
                }
                title={shortUnitName(r.name)}
                trailing={<span className="text-sm font-bold tabular-nums text-ink-900">{r.scorePct}%</span>}
              />
            ))}
          </List>
        </section>
      )}

      {units.length > 1 && <UnitSelectNav units={units} selected={selected?.id ?? ''} />}

      {selected && score && (
        <section className="rounded-card border border-line bg-surface p-4">
          <ProgressBar
            label={isAdminView ? shortUnitName(selected.name) : 'Minha Meta do Mês'}
            value={score.scorePct}
            valueLabel={`${score.scorePct}%`}
            tone={score.scorePct >= 80 ? 'success' : score.scorePct >= 50 ? 'warning' : 'danger'}
          />

          {/* Composição: cada componente com seu peso e o quanto rendeu. */}
          <div className="mt-4 space-y-3">
            {breakdown.length === 0 && (
              <p className="text-sm text-ink-500">Sem tarefas resolvidas no mês ainda.</p>
            )}
            {breakdown.map((t) => (
              <ProgressBar
                key={t.name}
                label={`${t.name} (peso ${t.weight})`}
                value={t.scorePct}
                valueLabel={`${t.done}/${t.resolved} · ${t.scorePct}%`}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
