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
import { metaDaUnidadeDoUsuario, metaIndividualDaUnidade } from '@/lib/metas/meta-por-usuario';
import { modoDaNotaIndividual, type FatosDaUnidade } from '@/lib/metas/nota-individual';
import { fatosDaUnidade } from '@/lib/metas/nota-individual-dados';
import { metaNoInicio, pontosBR, textoDoPlantao } from '@/lib/metas/meta-do-gerente';
import { shortUnitName } from '@/lib/unit-name';
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
  if (user.role === 'CASHIER') redirect('/modulos/comandas');
  /* O Separador do CD só separa: cai direto na caixa de entrada dele (v1.195.1 — a dos pedidos
     por setor; a fila antiga por produto está inativa), como o CAIXA. */
  if (user.role === 'SEPARATOR') redirect('/modulos/pedidos/recebidos');

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
    /* v1.215.0 — os fatos do mês (dia a dia, por autor) das unidades do gerente, para a nota individual. Falha aqui não derruba o Início: cai na nota herdada. */
    const fatos = new Map<string, FatosDaUnidade>();
    await Promise.all(overviews.map(async (o) => {
      const ym = o.operationalDate.slice(0, 7);
      if (modoDaNotaIndividual(ym) === 'DESLIGADA') return;
      const f = await fatosDaUnidade(o.unit.id, ym).catch(() => null);
      if (f) fatos.set(o.unit.id, f);
    }));
    return <HomeDoGerente nome={user.name} userId={user.id} overviews={overviews} fatos={fatos} alertas={central.alertas} areas={areas} />;
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
  nome, userId, overviews, fatos, alertas, areas,
}: {
  /** v1.215.0 — fatos do mês por unidade (vazio = nota herdada da unidade). */
  fatos: Map<string, FatosDaUnidade>;
  nome: string;
  /** v1.214.0 — o desconto da Escala de gerentes só aparece para quem está sem folga. */
  userId: string;
  overviews: Awaited<ReturnType<typeof getUnitsOverview>>;
  alertas: Awaited<ReturnType<typeof getCentralDaRede>>['alertas'];
  areas: Awaited<ReturnType<typeof montarMenu>>;
}) {
  const agg = aggregateDay(overviews);
  /* v1.215.0 — dezembro/2026 em diante a nota do gerente é a INDIVIDUAL; em novembro ela aparece como simulação. */
  const modo = overviews.length ? modoDaNotaIndividual(overviews[0].operationalDate.slice(0, 7)) : 'DESLIGADA';
  const herdada = metaNoInicio(overviews.map((o) => metaDaUnidadeDoUsuario(o.meta, userId)));
  const individual = modo === 'DESLIGADA' ? null : metaNoInicio(overviews.map((o) => metaIndividualDaUnidade(o.meta, userId, fatos.get(o.unit.id))));
  const meta = modo === 'OFICIAL' && individual ? individual : herdada;
  const TOM = { VERDE: 'green', AMBAR: 'amber', VERMELHO: 'red' } as const;
  const COR = { VERDE: 'var(--sgo-ok)', AMBAR: 'var(--sgo-warn)', VERMELHO: 'var(--sgo-bad)' } as const;
  const ROTULO = { VERDE: 'Na meta', AMBAR: 'Atenção', VERMELHO: 'Crítico' } as const;
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
          <div className="space-y-4 px-4 py-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="sgo-kpi__value" style={{ marginTop: 0, color: COR[meta.faixa] }} data-testid="meta-nota">{meta.scorePct}%</span>
                <span className="text-right text-xs" style={{ color: 'var(--sgo-ink-2)' }}>
                  {meta.temMedicao ? `${ROTULO[meta.faixa]} · ${modo === 'OFICIAL' ? 'sua nota individual do mês' : 'nota oficial do mês'}` : 'Ainda sem nada medido neste mês'}
                </span>
              </div>
              <SgoBar value={meta.scorePct} tone={TOM[meta.faixa]} height={10} data-testid="meta-barra" />
            </div>

            {modo === 'SIMULACAO' && individual && (
              <p className="rounded-lg border border-line px-3 py-2 text-xs" style={{ color: 'var(--sgo-ink-2)' }} data-testid="meta-simulacao">
                A partir de dezembro a nota passa a ser <b>individual</b>: checklists, desperdício, comandas e cofre contam só nos seus dias de plantão, e comunicados contam o que você confirmou.
                Se já valesse hoje, a sua nota seria <b style={{ color: COR[individual.faixa] }}>{individual.scorePct}%</b>.
              </p>
            )}
            {modo === 'OFICIAL' && (
              <p className="text-xs" style={{ color: 'var(--sgo-ink-2)' }} data-testid="meta-individual">
                Checklists, desperdício, comandas e cofre contam só nos seus dias de plantão (Escala de gerentes); comunicados contam o que você confirmou. Os demais itens são da unidade.
              </p>
            )}
            {meta.unidades.map((u) => (
              <div key={u.unitId} data-testid="meta-unidade" className="space-y-2">
                {meta.unidades.length > 1 && (
                  <p className="flex items-center justify-between gap-2 text-sm font-semibold" style={{ color: 'var(--sgo-ink)' }}>
                    <span className="min-w-0 break-words">{shortUnitName(u.unitName)}</span>
                    <span className="shrink-0 tabular-nums">{u.scorePct}%</span>
                  </p>
                )}
                {u.itens.length > 0 && (
                  <p className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>
                    {u.abaixoDaMeta === 0
                      ? 'Tudo o que conta na meta está em 80% ou mais.'
                      : `${u.abaixoDaMeta} de ${u.itens.length} item(ns) da meta abaixo de 80% — veja onde a nota está caindo:`}
                  </p>
                )}
                <ul className="space-y-2">
                  {u.itens.map((i) => (
                    <li key={i.key} data-testid="meta-item" data-faixa={i.faixa} className="rounded-lg border border-line px-3 py-2">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <span className="min-w-[10rem] flex-1 break-words text-sm font-medium" style={{ color: 'var(--sgo-ink)' }}>{i.name}</span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: COR[i.faixa] }}>{i.scorePct}% · {ROTULO[i.faixa]}</span>
                      </div>
                      <SgoBar value={i.scorePct} tone={TOM[i.faixa]} height={6} className="my-2" />
                      <p className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>
                        Peso {i.weight} · {i.done} de {i.resolved} feito(s)
                        {i.pontosPerdidos > 0 ? ` · tira ${pontosBR(i.pontosPerdidos)} ponto(s) da nota` : ' · não tira ponto'}
                      </p>
                      {i.individual && <p className="mt-1 text-xs" style={{ color: 'var(--sgo-ink-2)' }} data-testid="meta-plantao">{textoDoPlantao(i.individual)}</p>}
                    </li>
                  ))}
                  {u.descontos.map((d) => (
                    <li key={d.name} data-testid="meta-desconto" className="rounded-lg border border-line px-3 py-2">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <span className="min-w-[10rem] flex-1 break-words text-sm font-medium" style={{ color: 'var(--sgo-ink)' }}>{d.name}</span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: 'var(--sgo-bad)' }}>−{d.total}% na nota</span>
                      </div>
                      <p className="mt-1 break-words text-xs" style={{ color: 'var(--sgo-ink-2)' }}>
                        Desconto direto: {d.quantidade} × {pontosBR(d.pct)}%{d.detalhe ? ` — ${d.detalhe}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
                {u.semHorario && <p className="text-xs" style={{ color: 'var(--sgo-warn)' }} data-testid="meta-sem-horario">Você está sem horário na Escala de gerentes: todos os dias contam como plantão. Peça à Supervisão para cadastrar.</p>}
                {u.descontos.length > 0 && (
                  <p className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>Antes dos descontos a nota era {u.notaAntesDosDescontos}%.</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
