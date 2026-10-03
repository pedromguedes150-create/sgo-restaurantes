import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { resolveUnitFilter } from '@/lib/scope/unit-filter';
import { getSelectedUnitId } from '@/lib/scope/selected-unit';
import { viewableNavHrefs } from '@/lib/permissions';
import { montarMenu } from '@/lib/nav/menu';
import { recortarPizzas } from '@/lib/pizzas/acesso';
import { getCentralDaRede } from '@/lib/dashboard/central';
import { getUnitsOverview, aggregateDay } from '@/lib/tasks/overview';
import { Card, PanelHeader } from '@/components/sgo/panel';
import { SgoBar } from '@/components/sgo/sgo-bar';
import { ProgressRing } from '@/components/dashboard/progress-ring';
import { CentralOperacional, AlertasDaRede } from '@/components/dashboard/central-da-rede';
import { AcessosRapidos } from '@/components/dashboard/acessos-rapidos';
import { AutoRefresh } from '@/components/layout/auto-refresh';
import { ChevronRight, ListChecks, ScrollText, Target } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

/**
 * O Dashboard é a PORTA DE ENTRADA da operação, não um painel informativo.
 *
 * Duas leituras, porque as perguntas são diferentes:
 *  - GERENTE: "o que eu preciso fazer agora?" — alertas, meu dia, atalhos.
 *  - COORDENADOR/ADMIN: "como está a rede e onde eu entro?" — Central
 *    Operacional, com todo indicador clicável.
 *
 * Os dois caminhos obedecem o SELETOR GLOBAL: escolhida uma unidade lá em
 * cima, a central passa a falar só dela.
 *
 * Fase 4 do kit (v1.145.0): cabeçalho do kit, painéis `.sgo-panel` com
 * cabeçalho em linha, KPIs `.sgo-kpi` e linhas `.sgo-row`. Nenhum número,
 * link ou regra mudou de lugar.
 */
export default async function DashboardPage({ searchParams }: { searchParams: { unit?: string; unidade?: string } }) {
  const user = (await getSessionUser())!;
  const now = new Date();

  // Caixa entra no SGO só para bipar as comandas — vai direto para a conferência
  if (user.role === 'CASHIER') redirect('/modulos/comandas/conferencia');
  /* O Separador do CD so separa: cai direto na tela dele, como o CAIXA. */
  if (user.role === 'SEPARATOR') redirect('/modulos/separacao');

  if (user.role === 'FINANCE') {
    return (
      <div className="space-y-4">
        <AutoRefresh />
        <LargeTitle title={`Olá, ${user.name.split(' ')[0]} 👋`} subtitle="Seu perfil (Financeiro) recebe demandas aprovadas para pagamento." />
        <Card>
          <div className="sgo-rows">
            <Link href="/modulos/pagamentos" className="sgo-row min-h-12 outline-none focus-visible:shadow-sgo-focus">
              <span className="sgo-ric sgo-ric--blue" aria-hidden><ScrollText className="h-4 w-4" /></span>
              <span className="sgo-row__main"><span className="sgo-row__title">Pagamentos a processar</span></span>
              <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--sgo-ink-3)' }} aria-hidden />
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const unidades = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    select: { id: true, name: true, hasPizzeria: true },
    orderBy: { name: 'asc' },
  });
  const idsAcessiveis = unidades.map((u) => u.id);
  const filtro = resolveUnitFilter(searchParams, idsAcessiveis, getSelectedUnitId(idsAcessiveis));
  const daUnidade = filtro.all ? undefined : filtro.ids;

  const isManagerView = user.role === 'MANAGER' || user.role === 'COORDINATOR';

  if (isManagerView) {
    const [overviews, permitido, central] = await Promise.all([
      getUnitsOverview(user, now),
      viewableNavHrefs(user.role).then((hrefs) => new Set(recortarPizzas(hrefs, unidades.some((u) => u.hasPizzeria)))),
      getCentralDaRede(user, daUnidade, now),
    ]);
    const areas = await montarMenu(user.role, (href) => permitido.has(href));
    return <HomeDoGerente nome={user.name} overviews={overviews} alertas={central.alertas} areas={areas} />;
  }

  const central = await getCentralDaRede(user, daUnidade, now);
  const nomeDaUnidade = filtro.all ? null : unidades.find((u) => u.id === filtro.ids[0])?.name ?? null;

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={60} />
      <LargeTitle
        title={`Olá, ${user.name.split(' ')[0]} 👋`}
        subtitle={nomeDaUnidade ? `Visão de ${nomeDaUnidade}.` : `Visão consolidada da rede · ${central.totalUnidades} unidade(s).`}
      />
      <CentralOperacional dados={central} />
    </div>
  );
}

/* ───────────────────────── Gerente / Coordenador ───────────────────────── */

/**
 * A Home do gerente NÃO é o painel administrativo reduzido.
 *
 * A ordem é a do turno dele: o que está pegando fogo, como está o meu dia, as
 * ferramentas que eu abro toda hora, e só então a meta do mês. Indicador da
 * rede não entra aqui — ele não responde por ela.
 */
function HomeDoGerente({
  nome, overviews, alertas, areas,
}: {
  nome: string;
  overviews: Awaited<ReturnType<typeof getUnitsOverview>>;
  alertas: Awaited<ReturnType<typeof getCentralDaRede>>['alertas'];
  areas: Awaited<ReturnType<typeof montarMenu>>;
}) {
  const agg = aggregateDay(overviews);
  const doneW = overviews.reduce((s, o) => s + o.monthScore.doneWeight, 0);
  const resW = overviews.reduce((s, o) => s + o.monthScore.resolvedWeight, 0);
  const metaPct = resW === 0 ? 0 : Math.round((doneW / resW) * 100);
  const unidade = overviews.length === 1 ? overviews[0].unit.name : null;

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={60} />
      <LargeTitle title={`Olá, ${nome.split(' ')[0]} 👋`} subtitle={unidade ?? `${overviews.length} unidade(s) sob sua gestão.`} />

      <AlertasDaRede alertas={alertas} />

      {/* MEU DIA */}
      <section>
        <Card data-testid="meu-dia">
          <PanelHeader
            title="Meu dia"
            icon={<span className="sgo-panel__ic sgo-panel__ic--blue" aria-hidden><ListChecks className="h-4 w-4" /></span>}
            action={<Link href="/tarefas" className="sgo-link">Ir para as tarefas →</Link>}
          />
          <div className="flex items-center gap-5 px-4 py-4">
            <ProgressRing value={agg.progressPct} sublabel="do dia" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold" style={{ color: 'var(--sgo-ink)' }}>{agg.done} de {agg.total} tarefas concluídas</p>
              {agg.overdue > 0 && (
                <Link href="/tarefas?filter=atrasadas" className="block font-semibold underline" style={{ color: 'var(--sgo-bad)' }}>
                  ⚠ {agg.overdue} atrasada(s) — resolver agora →
                </Link>
              )}
              {agg.missed > 0 && <p style={{ color: 'var(--sgo-bad)' }}>✖ {agg.missed} não realizada(s)</p>}
              {agg.overdue === 0 && agg.missed === 0 && <p style={{ color: 'var(--sgo-ok)' }}>No prazo 🎉</p>}
            </div>
          </div>
        </Card>
      </section>

      <AcessosRapidos areas={areas} />

      {/* MINHA META DO MÊS — continua onde estava, no fim: ela orienta o mês,
          não o próximo passo do turno. */}
      <section>
        <Card data-testid="minha-meta">
          <PanelHeader
            title="Minha Meta do Mês"
            icon={<span className="sgo-panel__ic sgo-panel__ic--brand" aria-hidden><Target className="h-4 w-4" /></span>}
            action={<Link href="/modulos/metas" className="sgo-link">Ver metas</Link>}
          />
          <div className="px-4 py-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="sgo-kpi__value" style={{ marginTop: 0 }}>{metaPct}%</span>
              <span className="tabular-nums" style={{ color: 'var(--sgo-ink-2)' }}>{doneW}/{resW} pts</span>
            </div>
            <SgoBar value={metaPct} tone="blue" height={10} data-testid="meta-barra" />
          </div>
        </Card>
      </section>
    </div>
  );
}
