import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { getActiveSequence } from '@/lib/commands/active';
import { getLastFullCount, type FullCountInfo } from '@/lib/commands/full-count';
import { diaPrevisto, type Programacao, type Excecao } from '@/lib/commands/programacao';
import { resumirRotina, datasDoIntervalo, limitesDoMes, type ResumoDaRotina, type ResultadoOperacional, type DiaDaRotina } from '@/lib/commands/painel-calculo';
import type { SessionUser } from '@/lib/auth/session';

/** Dias da rotina de UMA unidade no mês: previsto (programação/exceção) × realizado (houve contagem). */
export async function diasDaRotina(unitId: string, ym: string, hoje: string): Promise<DiaDaRotina[]> {
  const { inicio, fim } = limitesDoMes(ym);
  const ate = hoje < fim ? hoje : fim;
  if (ate < inicio) return [];
  const [progs, excs, contagens] = await Promise.all([
    prisma.commandSchedule.findMany({ where: { unitId, active: true } }),
    prisma.commandScheduleException.findMany({ where: { unitId, date: { startsWith: ym } } }),
    prisma.commandCount.findMany({ where: { unitId, operationalDate: { startsWith: ym } }, select: { operationalDate: true } }),
  ]);
  const programacoes: Programacao[] = progs.map((p) => ({
    id: p.id, nome: p.name, tipo: p.type, dias: p.weekdays, inicioHora: p.startHour, fimHora: p.endHour,
    faixaDe: p.rangeStart, faixaAte: p.rangeEnd, prioridade: p.priority, ativa: p.active,
  }));
  const excecoes = new Map<string, Excecao>(excs.map((e) => [e.date, {
    id: e.id, data: e.date, nome: e.name, semConferencia: e.skip, tipo: e.type, faixaDe: e.rangeStart, faixaAte: e.rangeEnd,
  }]));
  const feitos = new Set(contagens.map((c) => c.operationalDate));
  return datasDoIntervalo(inicio, ate).map((data) => ({
    data, prevista: diaPrevisto(programacoes, excecoes.get(data) ?? null, data), realizada: feitos.has(data),
  }));
}

function proximoMes(ym: string): Date {
  const [y, m] = ym.split('-').map(Number);
  const p = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return new Date(`${p}-01T03:00:00Z`);
}

export type ResultadoDaUnidade = ResultadoOperacional & { baixadasNaSequencia: number };

/** O que a operação achou: abertas, aguardando validação, recuperadas e perdas definitivas do mês. */
export async function resultadoOperacional(unitId: string, ym: string): Promise<ResultadoDaUnidade> {
  const de = new Date(`${ym}-01T03:00:00Z`);
  const ate = proximoMes(ym);
  const [abertas, validacao, recuperadas, perdas, seq] = await Promise.all([
    prisma.commandDivergence.count({ where: { unitId, status: { in: ['OPEN', 'INVESTIGATING'] }, needsValidation: false } }),
    prisma.commandDivergence.count({ where: { unitId, status: { in: ['OPEN', 'INVESTIGATING'] }, needsValidation: true } }),
    prisma.commandDivergence.count({ where: { unitId, status: 'CLOSED', outcome: 'RECOVERED', resolvedAt: { gte: de, lt: ate } } }),
    prisma.commandDivergence.count({ where: { unitId, status: 'CLOSED', outcome: 'LOST', resolvedAt: { gte: de, lt: ate } } }),
    getActiveSequence(unitId, { ignorarProgramacao: true }),
  ]);
  return { abertas, aguardandoValidacao: validacao, recuperadas, perdasDefinitivas: perdas, baixadasNaSequencia: seq.lost.size };
}

export interface LinhaDoPainel {
  unitId: string;
  unitName: string;
  hoje: string;
  rotina: ResumoDaRotina;
  resultado: ResultadoDaUnidade;
  completa: FullCountInfo;
  reposicoesPendentes: number;
}

/** O painel da rede (ou das unidades do usuário) para um mês. Só leitura; nada é gravado. */
export async function getPainelDeComandas(user: SessionUser, ym: string, unitId?: string): Promise<LinhaDoPainel[]> {
  const units = await prisma.unit.findMany({
    /* AND, nunca espalhar os dois: o filtro da URL sobrescreveria o escopo do usuario */
    where: { active: true, AND: [unitScopeWhere(user, 'id') as object, unitId ? { id: unitId } : {}] },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, timezone: true, cutoffHour: true, commandSequences: { where: { active: true }, select: { id: true }, take: 1 } },
  });
  /* Unidade sem sequência cadastrada não usa o módulo: fora do painel (senão apareceria "atrasada" todo dia). */
  const linhas: LinhaDoPainel[] = [];
  for (const u of units.filter((x) => x.commandSequences.length > 0)) {
    const hoje = currentOperationalDate({ timezone: u.timezone, cutoffHour: u.cutoffHour });
    const [dias, resultado, completa, pend] = await Promise.all([
      diasDaRotina(u.id, ym, hoje),
      resultadoOperacional(u.id, ym),
      getLastFullCount(u.id, hoje),
      prisma.commandReplacement.count({ where: { unitId: u.id, receivedAt: null } }),
    ]);
    linhas.push({ unitId: u.id, unitName: u.name, hoje, rotina: resumirRotina(dias, hoje), resultado, completa, reposicoesPendentes: pend });
  }
  return linhas;
}
