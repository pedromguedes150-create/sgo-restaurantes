import { prisma } from '@/lib/db/prisma';
import { semanaDe, getFreelancerWeekLimit } from '@/lib/payments/recorrencia';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';
import {
  emBR, STATUS_TEXTO, TIPO_TEXTO,
  type Consolidado, type FiltroConsolidado, type FreelancerNoPeriodo, type LinhaDoConsolidado,
  type Periodo, type PontoDaEvolucao, type RecorrenteNaSemana, type TipoFiltro, type UnidadeNoPeriodo,
} from '@/lib/payments/consolidado-tipos';

export * from '@/lib/payments/consolidado-tipos';

/**
 * CONSOLIDADO DE FREELANCERS — a visão gerencial da rede.
 *
 * Não é o fechamento que vai ao Financeiro (esse continua na outra aba, com
 * PIX e total dos aprovados/pagos). Aqui a pergunta é outra: quais unidades
 * mais usam freelancer, quanto está sendo gasto e — principalmente — onde o
 * mesmo freelancer está sendo chamado semana após semana.
 *
 * Tudo sai de `payment_requests`. Nenhuma tabela nova, nenhum lançamento
 * duplicado, nenhuma regra de recorrência nova: a contagem por semana usa
 * `semanaDe()` e o limite de `getFreelancerWeekLimit()`, exatamente os mesmos
 * que disparam o alerta ao supervisor.
 */

/* ───────────────────────── datas ───────────────────────── */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dia = (isoStr: string) => new Date(`${isoStr}T00:00:00Z`);
const maisDias = (isoStr: string, n: number) => iso(new Date(dia(isoStr).getTime() + n * 86400000));

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Primeiro e último dia do mês de uma data. */
function mesDe(base: Date, deslocamento = 0): Periodo {
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth() + deslocamento;
  const ini = new Date(Date.UTC(y, m, 1));
  const fim = new Date(Date.UTC(y, m + 1, 0));
  return { de: iso(ini), ate: iso(fim), rotulo: `${MESES[ini.getUTCMonth()]}/${ini.getUTCFullYear()}`, tipo: 'mes' };
}

/** Semana segunda→domingo, reusando o mesmo corte da regra de recorrência. */
function semanaISO(baseISO: string, deslocamentoEmSemanas = 0): Periodo {
  const { start } = semanaDe(baseISO);
  const de = iso(new Date(start.getTime() + deslocamentoEmSemanas * 7 * 86400000));
  const ate = maisDias(de, 6);
  return { de, ate, rotulo: `semana de ${emBR(de)} a ${emBR(ate)}`, tipo: 'semana' };
}

/**
 * Traduz a escolha do filtro em datas. `hoje` é injetável para o teste não
 * depender do dia em que roda.
 */
export function resolverPeriodo(f: Pick<FiltroConsolidado, 'periodo' | 'de' | 'ate'>, hoje = new Date()): Periodo {
  const hojeISO = iso(hoje);
  switch (f.periodo) {
    case 'semana': return semanaISO(hojeISO);
    case 'semana-anterior': return semanaISO(hojeISO, -1);
    case 'mes-anterior': return mesDe(hoje, -1);
    case 'personalizado': {
      /* Datas inválidas não viram período vazio em silêncio: caem no mês, que
         é o que a tela mostra quando ninguém escolheu nada. */
      if (!ISO.test(f.de ?? '') || !ISO.test(f.ate ?? '')) return mesDe(hoje);
      const [de, ate] = f.de! <= f.ate! ? [f.de!, f.ate!] : [f.ate!, f.de!];
      return { de, ate, rotulo: `${emBR(de)} a ${emBR(ate)}`, tipo: 'livre' };
    }
    default: return mesDe(hoje);
  }
}

/**
 * O período imediatamente anterior, do mesmo tamanho — a base do "+18% em
 * relação ao mês anterior". Para mês cheio usa o mês calendário anterior (30
 * dias para trás cairia no meio de fevereiro e a comparação mentiria).
 */
export function periodoAnterior(p: Periodo, f: Pick<FiltroConsolidado, 'periodo'>): Periodo {
  if (f.periodo === 'mes') return mesDe(dia(p.de), -1);
  if (f.periodo === 'mes-anterior') return mesDe(dia(p.de), -1);
  if (f.periodo === 'semana' || f.periodo === 'semana-anterior') return semanaISO(p.de, -1);
  const dias = Math.round((dia(p.ate).getTime() - dia(p.de).getTime()) / 86400000) + 1;
  const ate = maisDias(p.de, -1);
  const de = maisDias(ate, -(dias - 1));
  return { de, ate, rotulo: `${emBR(de)} a ${emBR(ate)}`, tipo: 'livre' };
}

/* ───────────────────────── o consolidado ───────────────────────── */

/** FINANCE e quem vê a rede não têm recorte; os demais, só as suas unidades. */
function escopo(user: SessionUser): Prisma.PaymentRequestWhereInput {
  if (user.seesAllUnits || user.role === 'FINANCE') return {};
  return { unitId: { in: user.unitIds } };
}

/**
 * A data que posiciona a solicitação no tempo: o DIA DO TRABALHO quando existe
 * (é o que o gestor tem em mente), senão a data efetiva do lançamento, senão a
 * criação. Mesma cascata que a tela de Histórico usa para ordenar.
 */
const noPeriodo = (de: string, ate: string): Prisma.PaymentRequestWhereInput => {
  const gte = dia(de);
  const lt = new Date(dia(ate).getTime() + 86400000);
  return {
    OR: [
      { workDate: { gte, lt } },
      { workDate: null, entryDate: { gte, lt } },
      { workDate: null, entryDate: null, createdAt: { gte, lt } },
    ],
  };
};

const dataDe = (r: { workDate: Date | null; entryDate: Date | null; createdAt: Date }) =>
  (r.workDate ?? r.entryDate ?? r.createdAt).toISOString().slice(0, 10);

const tipoWhere = (t: TipoFiltro): Prisma.PaymentRequestWhereInput =>
  (t === 'TODOS' ? { type: { in: ['FREELANCER', 'OVERTIME'] } } : { type: t });

export async function getConsolidadoFreelancers(user: SessionUser, filtro: FiltroConsolidado, hoje = new Date()): Promise<Consolidado> {
  const periodo = resolverPeriodo(filtro, hoje);
  const anterior = periodoAnterior(periodo, filtro);
  const base: Prisma.PaymentRequestWhereInput = { ...escopo(user), ...tipoWhere(filtro.tipo) };
  const daUnidade = filtro.unitId ? { unitId: filtro.unitId } : {};

  /* A RECORRÊNCIA é contada em SEMANAS INTEIRAS e SEM o filtro de unidade.
     Duas razões, as duas vindas da regra que já existe:
     (1) a regra conta a semana segunda→domingo fechada — um período que começa
         numa quarta cortaria a semana ao meio e diria "2 solicitações" onde a
         supervisão recebeu alerta de 4;
     (2) "o freelancer é o mesmo em qualquer unidade" — quem trabalha 2× numa
         unidade e 2× em outra é recorrente, e filtrar por unidade o esconderia
         justamente de quem precisa ver.
     O escopo do usuário CONTINUA valendo (regra de unidade no servidor): quem
     só enxerga duas unidades conta sobre essas duas, e a tela diz isso. */
  const janelaDeSemanas = { de: semanaISO(periodo.de).de, ate: semanaISO(periodo.ate).ate };

  const [unidadesNoEscopo, linhasBrutas, paraRecorrencia, solicitacoesAntes, limiteSemanal] = await Promise.all([
    prisma.unit.count({ where: { active: true, ...(user.seesAllUnits || user.role === 'FINANCE' ? {} : { id: { in: user.unitIds } }) } }),
    prisma.paymentRequest.findMany({
      where: { ...base, ...daUnidade, ...noPeriodo(periodo.de, periodo.ate) },
      include: { unit: { select: { name: true } }, freelancer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.paymentRequest.findMany({
      where: {
        ...escopo(user),
        type: 'FREELANCER',
        status: { not: 'REJECTED' },
        freelancerId: { not: null },
        workDate: { gte: dia(janelaDeSemanas.de), lt: new Date(dia(janelaDeSemanas.ate).getTime() + 86400000) },
      },
      select: { freelancerId: true, workDate: true, amount: true, unitId: true, unit: { select: { name: true } }, freelancer: { select: { name: true } } },
    }),
    prisma.paymentRequest.count({ where: { ...base, ...daUnidade, ...noPeriodo(anterior.de, anterior.ate) } }),
    getFreelancerWeekLimit(),
  ]);

  /* Quem é recorrente, e em qual semana — a MESMA conta do alerta. */
  const porFreelancerSemana = new Map<string, RecorrenteNaSemana>();
  for (const r of paraRecorrencia) {
    if (!r.freelancerId || !r.workDate) continue;
    const s = semanaISO(r.workDate.toISOString().slice(0, 10));
    const chave = `${r.freelancerId}|${s.de}`;
    const g = porFreelancerSemana.get(chave) ?? {
      chave, freelancerId: r.freelancerId, nome: r.freelancer?.name ?? 'Freelancer',
      unidades: [], semanaDe: s.de, semanaAte: s.ate, solicitacoes: 0, valor: 0,
    };
    g.solicitacoes++;
    g.valor += Number(r.amount);
    if (!g.unidades.includes(r.unit.name)) g.unidades.push(r.unit.name);
    porFreelancerSemana.set(chave, g);
  }
  const semanasRecorrentes = [...porFreelancerSemana.values()].filter((g) => g.solicitacoes > limiteSemanal);
  const idsRecorrentes = new Set(semanasRecorrentes.map((g) => g.freelancerId));
  /* Recorrente numa semana específica: é assim que a linha ganha o selo, e não
     "recorrente em algum momento do período". */
  const semanasComSelo = new Set(semanasRecorrentes.map((g) => g.chave));

  const linhas: LinhaDoConsolidado[] = linhasBrutas.map((r) => {
    const data = dataDe(r);
    const chave = r.freelancerId ? `${r.freelancerId}|${semanaISO(data).de}` : '';
    return {
      id: r.id,
      data,
      unitId: r.unitId,
      unidade: r.unit.name,
      tipo: r.type,
      tipoLabel: TIPO_TEXTO[r.type],
      status: r.status,
      statusLabel: STATUS_TEXTO[r.status],
      valor: Number(r.amount),
      pessoa: r.freelancer?.name ?? r.collaboratorName ?? r.beneficiary ?? '—',
      freelancerId: r.freelancerId,
      recorrente: chave !== '' && semanasComSelo.has(chave),
    };
  });

  /* Os filtros de status e recorrência são aplicados DEPOIS da recorrência
     estar calculada: filtrar antes mudaria a conta da semana e o selo passaria
     a depender do que a pessoa escolheu ver. */
  const visiveis = linhas.filter((l) =>
    (filtro.status === 'TODOS' || l.status === filtro.status)
    && (filtro.recorrencia === 'todos' || l.recorrente));

  const naoRejeitadas = visiveis.filter((l) => l.status !== 'REJECTED');
  const rejeitadas = visiveis.filter((l) => l.status === 'REJECTED');
  const soma = (xs: LinhaDoConsolidado[]) => xs.reduce((s, l) => s + l.valor, 0);

  /* ── por freelancer ── */
  const porFreelancer = new Map<string, FreelancerNoPeriodo>();
  for (const l of visiveis) {
    if (!l.freelancerId) continue;
    const g = porFreelancer.get(l.freelancerId) ?? {
      freelancerId: l.freelancerId, nome: l.pessoa, solicitacoes: 0, valor: 0,
      recorrente: idsRecorrentes.has(l.freelancerId), rejeitadas: 0, unidades: [], linhas: [],
    };
    g.solicitacoes++;
    if (l.status === 'REJECTED') g.rejeitadas++; else g.valor += l.valor;
    if (!g.unidades.includes(l.unidade)) g.unidades.push(l.unidade);
    g.linhas.push(l);
    porFreelancer.set(l.freelancerId, g);
  }
  const freelancers = [...porFreelancer.values()].sort((a, b) => b.solicitacoes - a.solicitacoes || b.valor - a.valor);

  /* ── por unidade ── */
  const totalRede = soma(naoRejeitadas);
  const porUnidade = new Map<string, UnidadeNoPeriodo & { ids: Set<string>; recs: Set<string> }>();
  for (const l of visiveis) {
    const u = porUnidade.get(l.unitId) ?? { unitId: l.unitId, nome: l.unidade, solicitacoes: 0, unicos: 0, recorrentes: 0, valor: 0, pctRede: 0, ids: new Set<string>(), recs: new Set<string>() };
    u.solicitacoes++;
    if (l.status !== 'REJECTED') u.valor += l.valor;
    if (l.freelancerId) {
      u.ids.add(l.freelancerId);
      if (idsRecorrentes.has(l.freelancerId)) u.recs.add(l.freelancerId);
    }
    porUnidade.set(l.unitId, u);
  }
  const unidades: UnidadeNoPeriodo[] = [...porUnidade.values()]
    .map(({ ids, recs, ...u }) => ({ ...u, unicos: ids.size, recorrentes: recs.size, pctRede: totalRede > 0 ? (u.valor / totalRede) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor || b.solicitacoes - a.solicitacoes);

  /* ── evolução ──
     Mês (ou menos) vira barras por SEMANA; período maior, por MÊS. Trinta
     barras de dias num mês não formam leitura nenhuma. */
  const diasDoPeriodo = Math.round((dia(periodo.ate).getTime() - dia(periodo.de).getTime()) / 86400000) + 1;
  const granularidade: 'semana' | 'mes' = diasDoPeriodo <= 45 ? 'semana' : 'mes';
  const pontos = new Map<string, PontoDaEvolucao>();
  for (const l of visiveis) {
    const chave = granularidade === 'semana' ? semanaISO(l.data).de : l.data.slice(0, 7);
    const rotulo = granularidade === 'semana'
      ? emBR(chave).slice(0, 5)
      : `${MES_CURTO[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
    const p = pontos.get(chave) ?? { chave, rotulo, solicitacoes: 0, valor: 0 };
    p.solicitacoes++;
    if (l.status !== 'REJECTED') p.valor += l.valor;
    pontos.set(chave, p);
  }

  const solicitacoes = visiveis.length;
  const idsVisiveisNoPeriodo = new Set(visiveis.map((l) => l.freelancerId).filter((x): x is string => Boolean(x)));
  return {
    periodo,
    limiteSemanal,
    resumo: {
      solicitacoes,
      freelancersUnicos: porFreelancer.size,
      recorrentes: new Set(freelancers.filter((f) => f.recorrente).map((f) => f.freelancerId)).size,
      valorSolicitado: soma(naoRejeitadas),
      valorAprovadoPago: soma(visiveis.filter((l) => l.status === 'APPROVED' || l.status === 'PAID')),
      rejeitadasCount: rejeitadas.length,
      rejeitadasValor: soma(rejeitadas),
      mediaPorUnidade: unidadesNoEscopo > 0 ? solicitacoes / unidadesNoEscopo : 0,
      unidadesNoEscopo,
    },
    comparacao: {
      anterior,
      solicitacoesAntes,
      /* Sem base anterior não existe percentual: "+100%" saindo de zero é
         número bonito e informação nenhuma. */
      variacaoPct: solicitacoesAntes > 0 ? ((solicitacoes - solicitacoesAntes) / solicitacoesAntes) * 100 : null,
    },
    /* A seção lista os recorrentes que APARECEM no que está filtrado — senão
       ela contradiria o filtro de unidade. A CONTAGEM de cada um, essa continua
       sendo a da rede: é o número que a supervisão recebeu no alerta. */
    recorrentesNaSemana: semanasRecorrentes
      .filter((g) => idsVisiveisNoPeriodo.has(g.freelancerId))
      .sort((a, b) => b.solicitacoes - a.solicitacoes || b.valor - a.valor),
    porUnidade: unidades,
    evolucao: { granularidade, pontos: [...pontos.values()].sort((a, b) => a.chave.localeCompare(b.chave)) },
    freelancers,
  };
}
