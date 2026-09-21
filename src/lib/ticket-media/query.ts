import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import {
  competenciaAnterior, competenciasEntre, deslocarCompetencia, receita, somar,
  ticketConsolidado, ticketMedio, variacao, type Competencia, type NumerosBrutos,
} from './calculo';
import { participantesEm, type UnidadeParticipante } from './participacao';

/**
 * O PAINEL do Ticket Médio.
 *
 * Tudo aqui nasce de duas coisas: as unidades participantes NAQUELA competência
 * e os lançamentos importados. Nada é inferido do cadastro.
 *
 * O consolidado usa `ticketConsolidado` — Σreceita ÷ Σcupons. A média dos
 * tickets das unidades daria um número parecido e errado; ver o comentário lá.
 */

export interface LinhaDaUnidade {
  unitId: string;
  name: string;
  coupons: number;
  grossSales: number;
  discounts: number;
  receita: number;
  ticket: number | null;
  /** Do mês anterior, para a coluna de variação. */
  ticketAnterior: number | null;
  variacaoTicket: number | null;
  importado: boolean;
  importadoPor: string | null;
  importadoEm: Date | null;
  substituicoes: number;
}

export interface PainelDoTicket {
  competencia: Competencia;
  anterior: Competencia;
  /** Unidades participantes na competência, dentro do escopo do usuário. */
  participantes: number;
  importadas: number;
  pendentes: { unitId: string; name: string }[];
  completo: boolean;
  linhas: LinhaDaUnidade[];
  total: NumerosBrutos & { receita: number; ticket: number | null };
  /** Mesmos totais do mês anterior — só das unidades que têm os dois meses. */
  comparacao: {
    ticket: number | null;
    receita: number | null;
    coupons: number | null;
    grossSales: number | null;
    discounts: number | null;
  };
  /** Série do ticket consolidado, da mais antiga para a mais nova. */
  evolucao: { competencia: Competencia; ticket: number | null; receita: number; coupons: number }[];
}

const numeros = (e: { coupons: number; grossSales: unknown; discounts: unknown }): NumerosBrutos => ({
  coupons: e.coupons,
  grossSales: Number(e.grossSales),
  discounts: Number(e.discounts),
});

/**
 * Os lançamentos de um conjunto de unidades em várias competências, de uma vez.
 * Uma consulta por mês transformaria o gráfico de 12 pontos em 12 idas ao banco.
 */
async function lancamentos(unitIds: string[], competencias: Competencia[]) {
  if (unitIds.length === 0 || competencias.length === 0) return [];
  return prisma.ticketMediaEntry.findMany({
    where: { unitId: { in: unitIds }, competence: { in: competencias } },
    select: {
      unitId: true, competence: true, coupons: true, grossSales: true, discounts: true,
      importedByName: true, importedAt: true, replacedCount: true, replacedByName: true, replacedAt: true,
    },
  });
}

export const MESES_DA_EVOLUCAO = 12;

export async function getPainel(
  user: SessionUser,
  opcoes: { competencia: Competencia; unitId?: string | null },
): Promise<PainelDoTicket> {
  const { competencia } = opcoes;
  const anterior = competenciaAnterior(competencia);

  let participantes = await participantesEm(user, competencia);
  /* Filtro de unidade da tela. A unidade escolhida que NÃO participa some da
     lista — e a tela diz isso em texto, em vez de mostrar um painel zerado que
     pareceria "mês sem movimento". */
  if (opcoes.unitId) participantes = participantes.filter((p) => p.unitId === opcoes.unitId);

  const ids = participantes.map((p) => p.unitId);
  const janela = competenciasEntre(deslocarCompetencia(competencia, -(MESES_DA_EVOLUCAO - 1)), competencia);
  const todos = await lancamentos(ids, janela);

  const doMes = new Map(todos.filter((e) => e.competence === competencia).map((e) => [e.unitId, e]));
  const doAnterior = new Map(todos.filter((e) => e.competence === anterior).map((e) => [e.unitId, e]));

  const linhas: LinhaDaUnidade[] = participantes.map((p: UnidadeParticipante) => {
    const e = doMes.get(p.unitId);
    const ant = doAnterior.get(p.unitId);
    const n = e ? numeros(e) : { coupons: 0, grossSales: 0, discounts: 0 };
    const t = e ? ticketMedio(n) : null;
    const tAnt = ant ? ticketMedio(numeros(ant)) : null;
    return {
      unitId: p.unitId, name: p.name,
      ...n,
      receita: e ? receita(n) : 0,
      ticket: t,
      ticketAnterior: tAnt,
      variacaoTicket: variacao(t, tAnt),
      importado: Boolean(e),
      importadoPor: e?.importedByName ?? null,
      importadoEm: e?.importedAt ?? null,
      substituicoes: e?.replacedCount ?? 0,
    };
  });

  const comLancamento = linhas.filter((l) => l.importado);
  const soma = somar(comLancamento);
  const pendentes = linhas.filter((l) => !l.importado).map((l) => ({ unitId: l.unitId, name: l.name }));

  /* A comparação usa SÓ as unidades presentes nos dois meses. Somar o mês
     cheio contra um mês anterior incompleto acusaria uma queda que é só de
     importação faltando. */
  const nosDois = participantes.filter((p) => doMes.has(p.unitId) && doAnterior.has(p.unitId)).map((p) => p.unitId);
  const somaAtualComparavel = somar(nosDois.map((id) => numeros(doMes.get(id)!)));
  const somaAnteriorComparavel = somar(nosDois.map((id) => numeros(doAnterior.get(id)!)));

  const evolucao = [];
  for (const c of janela) {
    const doC = todos.filter((e) => e.competence === c).map(numeros);
    const s = somar(doC);
    evolucao.push({ competencia: c, ticket: doC.length ? ticketConsolidado(doC) : null, receita: receita(s), coupons: s.coupons });
  }

  return {
    competencia, anterior,
    participantes: participantes.length,
    importadas: comLancamento.length,
    pendentes,
    completo: participantes.length > 0 && pendentes.length === 0,
    linhas,
    total: { ...soma, receita: receita(soma), ticket: ticketConsolidado(comLancamento) },
    comparacao: {
      ticket: variacao(ticketConsolidado([somaAtualComparavel]), ticketConsolidado([somaAnteriorComparavel])),
      receita: variacao(receita(somaAtualComparavel), receita(somaAnteriorComparavel)),
      coupons: variacao(somaAtualComparavel.coupons, somaAnteriorComparavel.coupons),
      grossSales: variacao(somaAtualComparavel.grossSales, somaAnteriorComparavel.grossSales),
      discounts: variacao(somaAtualComparavel.discounts, somaAnteriorComparavel.discounts),
    },
    evolucao,
  };
}

/** As competências que já têm algum lançamento — alimenta o seletor de ano. */
export async function competenciasComDados(user: SessionUser): Promise<Competencia[]> {
  const unidades = await prisma.unit.findMany({
    where: { ...(user.seesAllUnits ? {} : { id: { in: user.unitIds } }) },
    select: { id: true },
  });
  if (unidades.length === 0) return [];
  const linhas = await prisma.ticketMediaEntry.findMany({
    where: { unitId: { in: unidades.map((u) => u.id) } },
    select: { competence: true },
    distinct: ['competence'],
    orderBy: { competence: 'desc' },
  });
  return linhas.map((l) => l.competence);
}

/**
 * O resumo para o cartão do Dashboard / Central Operacional.
 *
 * A competência é o MÊS CORRENTE, sempre — decisão do Pedro, mantida depois de
 * eu levantar a alternativa. Consequência a conhecer: a planilha de um mês só
 * sai depois que ele fecha, então no começo de cada mês o cartão mostra "–" e
 * "0 de N importadas" até a primeira planilha entrar. Isso é leitura correta do
 * mês corrente, e serve de cobrança — o que o cartão NÃO faz é mostrar o
 * fechamento do mês passado no lugar.
 *
 * Devolve `null` quando não há unidade participante no alcance do usuário —
 * um cartão "R$ 0,00" ali afirmaria que a rede não vendeu nada.
 */
export async function resumoParaODashboard(
  user: SessionUser,
  opcoes: { competencia: Competencia; unitIds?: string[] | null },
): Promise<{ competencia: Competencia; ticket: number | null; receita: number; coupons: number; importadas: number; participantes: number; completo: boolean } | null> {
  const filtrar = (ps: UnidadeParticipante[]) => {
    if (!opcoes.unitIds || opcoes.unitIds.length === 0) return ps;
    const permitidas = new Set(opcoes.unitIds);
    return ps.filter((p) => permitidas.has(p.unitId));
  };

  const { competencia } = opcoes;
  const participantes = filtrar(await participantesEm(user, competencia));
  if (participantes.length === 0) return null;

  const linhas = await lancamentos(participantes.map((p) => p.unitId), [competencia]);
  const ns = linhas.map(numeros);
  const s = somar(ns);

  return {
    competencia,
    ticket: ns.length ? ticketConsolidado(ns) : null,
    receita: receita(s),
    coupons: s.coupons,
    importadas: linhas.length,
    participantes: participantes.length,
    completo: participantes.length > 0 && linhas.length === participantes.length,
  };
}
