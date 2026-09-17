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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressRing } from '@/components/dashboard/progress-ring';
import { CentralOperacional, AlertasDaRede } from '@/components/dashboard/central-da-rede';
import { AcessosRapidos } from '@/components/dashboard/acessos-rapidos';
import { AutoRefresh } from '@/components/layout/auto-refresh';
import { ScrollText } from 'lucide-react';
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
        <LargeTitle title={`Olá, ${user.name.split(' ')[0]} 👋`} />
        <Card>
          <CardContent className="py-6 text-sm text-ink-500">
            Seu perfil (Financeiro) recebe demandas aprovadas para pagamento.
          </CardContent>
        </Card>
        <Link
          href="/modulos/pagamentos"
          className="flex items-center gap-2 rounded-lg border bg-surface px-4 py-3 text-sm font-semibold text-brand"
        >
          <ScrollText className="h-5 w-5 text-brand" /> Pagamentos a processar
        </Link>
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
    <div className="space-y-5">
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
    <div className="space-y-5">
      <AutoRefresh seconds={60} />
      <LargeTitle title={`Olá, ${nome.split(' ')[0]} 👋`} subtitle={unidade ?? `${overviews.length} unidade(s) sob sua gestão.`} />

      <AlertasDaRede alertas={alertas} />

      {/* MEU DIA */}
      <section>
        <h2 className="mb-2 sgo-type-11 font-semibold text-ink-500">Meu dia</h2>
        <Card>
          <CardContent className="flex items-center gap-5 py-5">
            <ProgressRing value={agg.progressPct} sublabel="do dia" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-ink-900">{agg.done} de {agg.total} tarefas concluídas</p>
              {agg.overdue > 0 && (
                <Link href="/tarefas?filter=atrasadas" className="block font-semibold text-danger underline">
                  ⚠ {agg.overdue} atrasada(s) — resolver agora →
                </Link>
              )}
              {agg.missed > 0 && <p className="text-danger">✖ {agg.missed} não realizada(s)</p>}
              {agg.overdue === 0 && agg.missed === 0 && <p className="text-success">No prazo 🎉</p>}
              <Link href="/tarefas" className="inline-block pt-1 font-semibold text-brand underline">Ir para as tarefas →</Link>
            </div>
          </CardContent>
        </Card>
      </section>

      <AcessosRapidos areas={areas} />

      {/* MINHA META DO MÊS — continua onde estava, no fim: ela orienta o mês,
          não o próximo passo do turno. */}
      <section>
        <Card>
          <CardHeader><CardTitle>Minha Meta do Mês</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-semibold text-ink-900">{metaPct}%</span>
              <span className="text-ink-500">{doneW}/{resW} pts</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-sunken">
              <div className="h-full rounded-full bg-brand" style={{ width: `${metaPct}%` }} />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
