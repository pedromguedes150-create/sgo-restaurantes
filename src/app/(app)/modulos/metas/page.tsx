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
import { Card, PanelHeader } from '@/components/sgo/panel';
import { List, ListRow } from '@/components/ui/ds/list-row';
import { ProgressBar } from '@/components/ui/ds/progress-bar';
import { shortUnitName } from '@/lib/unit-name';
import { Trophy, Download, Settings, PieChart, Target, ListChecks } from 'lucide-react';
import { comporMeta, resumirRanking, COR_FAIXA, faixaDaMeta } from '@/lib/metas/graficos';
import { RoscaDaMeta, RoscaDasUnidades, RoscaDasTarefas, RoscaDaComposicao } from '@/components/metas/graficos-metas';

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
  /* Gráficos (v1.163.0): composição PURA do que já foi calculado acima. */
  const resumoRanking = resumirRanking(ranking);
  const composicao = comporMeta(breakdown);
  const posicao = selected ? resumoRanking.posicaoDe(selected.id) : null;

  return (
    <div className="space-y-4">
      {/* Cabeçalho do kit (Fase 4). A família do módulo estava, por engano,
          dentro da linha de ações — passou ao subtítulo, onde vive nas demais telas. */}
      <LargeTitle
        title="Metas e Performance"
        subtitle={<>Mês {monthLabel}<span className="block"><FamilyTabs active="/modulos/metas" /></span></>}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <a href={exportHref} className="sgo-btn"><Download className="h-3.5 w-3.5" /> Excel</a>
            <PrintButton label="PDF" />
          </div>
        }
      />

      {(user.role === 'ADMIN' || user.role === 'SUPERVISOR') && podeVer('/modulos/metas/config') && (
        <div className="print:hidden">
          <List>
            <ListRow
              href="/modulos/metas/config"
              leading={<span className="sgo-ric sgo-ric--blue" aria-hidden><Settings className="h-4 w-4" /></span>}
              title="Configuração da Meta"
              subtitle="Todos os componentes e seus pesos"
            />
          </List>
        </div>
      )}
      {lateEntryPct != null && <LateEntryConfig current={lateEntryPct} />}

      {/* Linha de filtros do kit: mês de referência e unidade. */}
      <div className="sgo-filtros -mx-4 print:hidden">
        <span className="sgo-label">Mês de referência</span>
        <UnitSelectNav className="w-48" units={months.map((m) => ({ id: m.value, name: m.label }))} selected={ym} paramName="month" />
        {units.length > 1 && (
          <>
            <span className="sgo-label ml-2">Unidade</span>
            <UnitSelectNav className="w-64" units={units} selected={selected?.id ?? ''} />
          </>
        )}
      </div>

      {isAdminView && ranking.length > 0 && (
        <Card>
          <PanelHeader title="Ranking de metas" icon={<span className="sgo-panel__ic sgo-panel__ic--amber" aria-hidden><Trophy className="h-4 w-4" /></span>} count={ranking.length} />
          <List className="rounded-none border-0 bg-transparent shadow-none" stagger={false}>
            {ranking.map((r, i) => (
              <ListRow
                key={r.unitId}
                href={linkFor({ unit: r.unitId })}
                leading={
                  <span className={`flex h-7 w-7 items-center justify-center rounded-pill text-xs font-bold tabular-nums ${r.unitId === selected?.id ? 'bg-brand text-on-brand' : 'bg-sunken text-ink-700'}`}>{i + 1}</span>
                }
                title={shortUnitName(r.name)}
                trailing={
                  <>
                    <span className="hidden h-2 w-40 overflow-hidden rounded-pill bg-sunken sm:block" aria-hidden>
                      <span className="block h-full rounded-pill" style={{ width: `${Math.max(2, Math.min(100, r.scorePct))}%`, background: COR_FAIXA[faixaDaMeta(r.scorePct)] }} />
                    </span>
                    <span className="w-12 text-right text-sm font-bold tabular-nums" style={{ color: COR_FAIXA[faixaDaMeta(r.scorePct)] }}>{r.scorePct}%</span>
                  </>
                }
              />
            ))}
          </List>
        </Card>
      )}

      {selected && score && (
        <>
          {/* Roscas (v1.163.0): a meta da unidade, a rede por faixa e as tarefas do mês. */}
          <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${isAdminView && ranking.length > 0 ? 'xl:grid-cols-3' : ''}`}>
            <Card>
              <PanelHeader title={isAdminView ? 'Meta da unidade' : 'Minha Meta do Mês'} icon={<span className="sgo-panel__ic sgo-panel__ic--brand" aria-hidden><Target className="h-4 w-4" /></span>} />
              <div className="p-4">
                <RoscaDaMeta scorePct={score.scorePct} rotulo={`${shortUnitName(selected.name)}${posicao ? ` · ${posicao}º de ${resumoRanking.unidades}` : ''}`} pontos={composicao.pesoTotal > 0 ? { ganhos: composicao.pontosGanhos, total: composicao.pesoTotal } : undefined} />
              </div>
            </Card>
            {isAdminView && ranking.length > 0 && (
              <Card>
                <PanelHeader title="Unidades por faixa" icon={<span className="sgo-panel__ic sgo-panel__ic--green" aria-hidden><PieChart className="h-4 w-4" /></span>} />
                <div className="p-4"><RoscaDasUnidades resumo={resumoRanking} /></div>
              </Card>
            )}
            <Card>
              <PanelHeader title="Tarefas do mês" icon={<span className="sgo-panel__ic sgo-panel__ic--blue" aria-hidden><ListChecks className="h-4 w-4" /></span>} />
              <div className="p-4"><RoscaDasTarefas composicao={composicao} /></div>
            </Card>
          </div>

          {/* Composição: cada componente com seu peso e o quanto rendeu — a mesma conta de sempre, agora em rosca + tabela. */}
          <Card>
            <PanelHeader title="Composição da meta" icon={<span className="sgo-panel__ic sgo-panel__ic--amber" aria-hidden><PieChart className="h-4 w-4" /></span>} count={composicao.fatias.length} />
            <div className="p-4">
              {breakdown.length === 0 ? (
                <p className="text-sm text-ink-500">Sem tarefas resolvidas no mês ainda.</p>
              ) : (
                <>
                  <ProgressBar
                    className="mb-4"
                    label={isAdminView ? shortUnitName(selected.name) : 'Minha Meta do Mês'}
                    value={score.scorePct}
                    valueLabel={`${score.scorePct}%`}
                    tone={score.scorePct >= 80 ? 'success' : score.scorePct >= 50 ? 'warning' : 'danger'}
                  />
                  <RoscaDaComposicao composicao={composicao} />
                </>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
