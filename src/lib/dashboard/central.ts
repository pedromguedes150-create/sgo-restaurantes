import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { competenciaDeHoje, emNumero, emReal, rotuloDaCompetencia } from '@/lib/ticket-media/calculo';
import { resumoParaODashboard } from '@/lib/ticket-media/query';
import { getUnitsOverview, aggregateDay, type UnitOverview } from '@/lib/tasks/overview';
import { getOccurrenceSummary } from '@/lib/occurrences/query';
import { getOpenDivergenceCount } from '@/lib/commands/query';
import { getPendingCancellationCount } from '@/lib/cancellations/query';
import { getToApproveCount } from '@/lib/payments/query';
import { getConsolidadoFreelancers } from '@/lib/payments/consolidado';
import type { SessionUser } from '@/lib/auth/session';

/**
 * CENTRAL OPERACIONAL DA REDE — a porta de entrada, não um painel de leitura.
 *
 * Todo número aqui é COMPOSIÇÃO do que os módulos já calculam: `getUnitsOverview`,
 * `getOccurrenceSummary`, o consolidado de freelancers, as coletas de óleo. Não
 * há tabela nova, cache nem número recalculado por fora — se a tela do módulo
 * mudar de conta, esta muda junto. Um painel que mantém a própria versão dos
 * números é um painel que, em três meses, discorda das telas.
 *
 * E todo número tem DESTINO: `href` é parte do indicador, não enfeite. "18
 * ocorrências" que não abre as 18 obriga a pessoa a procurar de novo o que o
 * painel acabou de contar.
 */

export type Gravidade = 'critico' | 'atencao' | 'ok';

export interface Indicador {
  id: string;
  titulo: string;
  valor: string;
  /** A linha de apoio: o que o número significa. */
  detalhe: string;
  /** Para onde o clique leva — já filtrado. */
  href: string;
  tom: Gravidade;
}

export interface AlertaDaRede {
  id: string;
  gravidade: Gravidade;
  rotulo: string;
  unidade: string | null;
  problema: string;
  /** "há 3 dias", "hoje" — só quando houver tempo de verdade a mostrar. */
  quando: string | null;
  acao: string;
  href: string;
}

export interface UnidadeHoje {
  unitId: string;
  nome: string;
  tarefasPct: number;
  atrasadas: number;
  ocorrenciasAbertas: number;
  pendencias: number;
  tom: Gravidade;
}

export interface CentralDaRede {
  indicadores: Indicador[];
  alertas: AlertaDaRede[];
  unidades: UnidadeHoje[];
  totalUnidades: number;
  unidadesComAtencao: number;
}

const inteiro = (n: number) => n.toLocaleString('pt-BR');

/** Semáforo do dia da unidade → a nossa gravidade. */
function tomDoDia(t: 'success' | 'medium' | 'critical' | 'neutral'): Gravidade {
  return t === 'critical' ? 'critico' : t === 'medium' ? 'atencao' : 'ok';
}

/** Primeiro e último dia do mês corrente, em ISO. */
function mesCorrente(hoje: Date) {
  const de = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
  const ate = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0));
  return { de: de.toISOString().slice(0, 10), ate: ate.toISOString().slice(0, 10) };
}

export async function getCentralDaRede(user: SessionUser, unitIds: string[] | undefined, hoje = new Date()): Promise<CentralDaRede> {
  const { de, ate } = mesCorrente(hoje);
  const soDaUnidade = unitIds && unitIds.length === 1 ? unitIds[0] : undefined;

  const [overviews, occ, divergencias, cancelamentos, aprovar, freelas, unidadesDaRede, oleoDoMes, desperdicioDoMes, ticket] = await Promise.all([
    getUnitsOverview(user, hoje),
    getOccurrenceSummary(user, soDaUnidade ? { unitId: soDaUnidade } : {}),
    getOpenDivergenceCount(user),
    getPendingCancellationCount(user),
    getToApproveCount(user),
    getConsolidadoFreelancers(user, { periodo: 'mes', tipo: 'FREELANCER', status: 'TODOS', recorrencia: 'todos', unitId: soDaUnidade }, hoje),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, select: { id: true, name: true } }),
    prisma.oilCollection.findMany({
      where: { ...unitScopeWhere(user, 'unitId'), ...(soDaUnidade ? { unitId: soDaUnidade } : {}), operationalDate: { gte: de, lte: ate } },
      select: { unitId: true, liters: true },
    }),
    prisma.wasteEntry.findMany({
      where: { ...unitScopeWhere(user, 'unitId'), ...(soDaUnidade ? { unitId: soDaUnidade } : {}), operationalDate: { gte: de, lte: ate } },
      select: { unitId: true },
    }),
    resumoParaODashboard(user, { competencia: competenciaDeHoje(hoje), unitIds }),
  ]);

  const visiveis = soDaUnidade ? overviews.filter((o) => o.unit.id === soDaUnidade) : overviews;
  const dia = aggregateDay(visiveis);

  /* ── Unidades hoje ── */
  const unidades: UnidadeHoje[] = visiveis.map((o) => ({
    unitId: o.unit.id,
    nome: o.unit.name,
    tarefasPct: o.summary.total === 0 ? 100 : Math.round((o.summary.done / o.summary.total) * 100),
    atrasadas: o.summary.overdue + o.summary.missed,
    ocorrenciasAbertas: 0,
    pendencias: o.summary.pending,
    tom: tomDoDia(o.summary.tone),
  }));
  const comAtencao = unidades.filter((u) => u.tom !== 'ok').length;

  /* ── Óleo: quem lançou e quem não lançou no mês ── */
  const litros = oleoDoMes.reduce((s, r) => s + Number(r.liters), 0);
  const lancaramOleo = new Set(oleoDoMes.map((r) => r.unitId));
  const semOleo = unidadesDaRede.filter((u) => !lancaramOleo.has(u.id) && (!soDaUnidade || u.id === soDaUnidade));

  /* ── Desperdício: COBERTURA, não peso.
     O peso vive em kg e em unidades ao mesmo tempo (categoria com medida `un`),
     e somar os dois daria um número sem significado. O que cabe num cartão da
     rede é quantos dias foram lançados — que é o que a meta já mede. ── */
  const diasComDesperdicio = desperdicioDoMes.length;

  const indicadores: Indicador[] = [
    {
      id: 'unidades',
      titulo: 'Unidades',
      valor: inteiro(unidades.length),
      detalhe: comAtencao === 0 ? 'todas em dia' : `${comAtencao} precisa(m) de atenção`,
      href: '/tarefas?unit=todas',
      tom: comAtencao === 0 ? 'ok' : 'atencao',
    },
    {
      id: 'tarefas',
      titulo: 'Tarefas de hoje',
      valor: `${dia.progressPct}%`,
      detalhe: dia.overdue + dia.missed > 0 ? `${inteiro(dia.overdue + dia.missed)} atrasada(s) ou não realizada(s)` : `${inteiro(dia.done)} de ${inteiro(dia.total)} concluídas`,
      href: dia.overdue + dia.missed > 0 ? '/tarefas?filter=atrasadas' : '/tarefas',
      tom: dia.overdue + dia.missed > 0 ? 'critico' : 'ok',
    },
    {
      id: 'ocorrencias',
      titulo: 'Ocorrências abertas',
      valor: inteiro(occ.open + occ.inProgress),
      detalhe: occ.criticalOpen > 0 ? `${inteiro(occ.criticalOpen)} crítica(s)` : occ.openOver48h > 0 ? `${inteiro(occ.openOver48h)} aberta(s) há mais de 48h` : 'nenhuma crítica',
      href: '/modulos/ocorrencias?status=OPEN',
      tom: occ.criticalOpen > 0 ? 'critico' : occ.openOver48h > 0 ? 'atencao' : 'ok',
    },
    /* TICKET MÉDIO — só entra quando há unidade participante no alcance de
       quem olha. Com o seletor em "Toda a Rede", o número continua sendo o das
       CHURRASCARIAS: CD, lanchonete e produtos não participam do indicador, e
       somá-los aqui daria um ticket que não existe em lugar nenhum. Sem
       participante, o cartão some — melhor do que "R$ 0,00", que afirmaria que
       a rede não vendeu. */
    ...(ticket
      ? [{
        id: 'ticket-medio',
        titulo: 'Ticket Médio',
        valor: emReal(ticket.ticket),
        /* O MÊS vai escrito no cartão: ele nem sempre é o corrente (ver
           `resumoParaODashboard`), e um ticket sem mês seria um número que a
           pessoa atribui ao mês errado. */
        detalhe: ticket.completo
          ? `${rotuloDaCompetencia(ticket.competencia)} · ${emNumero(ticket.coupons)} cupons · receita ${emReal(ticket.receita)}`
          : `${rotuloDaCompetencia(ticket.competencia)} parcial — ${ticket.importadas} de ${ticket.participantes} unidades importadas`,
        href: `/modulos/ticket-medio?competencia=${ticket.competencia}`,
        tom: (ticket.completo ? 'ok' : 'atencao') as Gravidade,
      }]
      : []),
    {
      id: 'freelance',
      titulo: 'Freelancers no mês',
      valor: inteiro(freelas.resumo.solicitacoes),
      detalhe: freelas.resumo.recorrentes > 0
        ? `${inteiro(freelas.resumo.recorrentes)} recorrente(s) · ${inteiro(freelas.resumo.freelancersUnicos)} pessoa(s)`
        : `${inteiro(freelas.resumo.freelancersUnicos)} pessoa(s) · ${freelas.porUnidade.length} unidade(s)`,
      href: '/modulos/pagamentos/relatorio-freelancers?aba=consolidado&periodo=mes',
      tom: freelas.resumo.recorrentes > 0 ? 'atencao' : 'ok',
    },
    {
      id: 'oleo',
      titulo: 'Coleta de óleo',
      valor: `${inteiro(Math.round(litros))} L`,
      detalhe: semOleo.length > 0 ? `${inteiro(semOleo.length)} unidade(s) sem lançamento no mês` : `${lancaramOleo.size} unidade(s) lançaram`,
      href: '/modulos/oleo',
      tom: semOleo.length > 0 ? 'atencao' : 'ok',
    },
    {
      id: 'desperdicio',
      titulo: 'Desperdício',
      valor: inteiro(diasComDesperdicio),
      detalhe: 'dia(s) lançado(s) no mês na rede',
      href: '/modulos/desperdicios',
      tom: 'ok',
    },
    {
      id: 'pagamentos',
      titulo: 'Pagamentos',
      valor: inteiro(aprovar),
      detalhe: aprovar > 0 ? 'aguardando sua aprovação' : 'nada na sua fila',
      href: '/modulos/pagamentos',
      tom: aprovar > 0 ? 'atencao' : 'ok',
    },
    {
      id: 'caixa',
      titulo: 'Caixa',
      valor: inteiro(divergencias + cancelamentos),
      detalhe: `${inteiro(divergencias)} divergência(s) · ${inteiro(cancelamentos)} cancelamento(s) sem justificativa`,
      href: divergencias > 0 ? '/modulos/comandas' : '/modulos/cancelamentos',
      tom: divergencias + cancelamentos > 0 ? 'atencao' : 'ok',
    },
  ];

  /* ── Central de alertas ──
     Só entra o que exige AÇÃO e diz de quem é. Alerta decorativo ensina a
     ignorar a lista inteira, e é a lista que a supervisão olha primeiro. */
  const alertas: AlertaDaRede[] = [];

  if (occ.criticalOpen > 0) {
    alertas.push({
      id: 'occ-critica', gravidade: 'critico', rotulo: 'Crítico', unidade: null,
      problema: `${inteiro(occ.criticalOpen)} ocorrência(s) crítica(s) em aberto`,
      quando: null, acao: 'Encerrar ou registrar a ação corretiva',
      href: '/modulos/ocorrencias?status=OPEN',
    });
  }
  if (occ.openOver48h > 0) {
    alertas.push({
      id: 'occ-48h', gravidade: 'atencao', rotulo: 'Parada', unidade: null,
      problema: `${inteiro(occ.openOver48h)} ocorrência(s) aberta(s) há mais de 48h`,
      quando: 'mais de 48h', acao: 'Cobrar andamento da unidade',
      href: '/modulos/ocorrencias?status=OPEN',
    });
  }
  for (const u of unidades.filter((x) => x.atrasadas > 0).sort((a, b) => b.atrasadas - a.atrasadas).slice(0, 4)) {
    alertas.push({
      id: `tarefas-${u.unitId}`, gravidade: u.atrasadas > 3 ? 'critico' : 'atencao', rotulo: 'Atrasado', unidade: u.nome,
      problema: `${inteiro(u.atrasadas)} tarefa(s) atrasada(s) ou não realizada(s)`,
      quando: 'hoje', acao: 'Abrir as tarefas da unidade',
      href: `/tarefas?unit=${u.unitId}&filter=atrasadas`,
    });
  }
  for (const g of freelas.recorrentesNaSemana.slice(0, 4)) {
    alertas.push({
      id: `freela-${g.chave}`, gravidade: 'atencao', rotulo: 'Recorrência', unidade: g.unidades.join(', ') || null,
      problema: `${g.nome} com ${inteiro(g.solicitacoes)} solicitações na semana`,
      quando: `semana de ${g.semanaDe.split('-').reverse().join('/')}`,
      acao: 'Conferir antes de aprovar',
      href: '/modulos/pagamentos/relatorio-freelancers?aba=consolidado&periodo=semana&rec=recorrentes',
    });
  }
  /* Uma linha por unidade sem óleo enchia a lista com a MESMA frase repetida —
     e lista que se repete ensina a ignorar a lista inteira, justo a que a
     supervisão olha primeiro. Vira um alerta só, que nomeia as unidades
     enquanto couber e conta quando não couber. */
  if (semOleo.length > 0) {
    const nomes = semOleo.map((u) => u.name);
    alertas.push({
      id: 'oleo-sem-lancamento', gravidade: 'atencao', rotulo: 'Sem lançamento',
      unidade: nomes.length <= 3 ? nomes.join(', ') : null,
      problema: semOleo.length === 1
        ? 'Nenhuma coleta de óleo lançada no mês'
        : `${inteiro(semOleo.length)} unidades sem coleta de óleo lançada no mês`,
      quando: 'no mês', acao: 'Cobrar o lançamento com o comprovante',
      href: '/modulos/oleo',
    });
  }
  if (divergencias > 0) {
    alertas.push({
      id: 'comandas', gravidade: 'atencao', rotulo: 'Conferência', unidade: null,
      problema: `${inteiro(divergencias)} comanda(s) com divergência em apuração`,
      quando: null, acao: 'Apurar recuperada ou perdida',
      href: '/modulos/comandas',
    });
  }
  if (aprovar > 0) {
    alertas.push({
      id: 'pagamentos', gravidade: 'ok', rotulo: 'Na sua fila', unidade: null,
      problema: `${inteiro(aprovar)} pagamento(s) aguardando sua aprovação`,
      quando: null, acao: 'Aprovar ou reprovar',
      href: '/modulos/pagamentos',
    });
  }

  const ordem: Record<Gravidade, number> = { critico: 0, atencao: 1, ok: 2 };
  alertas.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]);

  return {
    indicadores,
    alertas,
    unidades: [...unidades].sort((a, b) => ordem[a.tom] - ordem[b.tom] || b.atrasadas - a.atrasadas),
    totalUnidades: unidades.length,
    unidadesComAtencao: comAtencao,
  };
}

export type { UnitOverview };
