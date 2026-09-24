import { prisma } from '@/lib/db/prisma';
import { getUsageBoard, type UnitUsageRow } from '@/lib/supervisor/usage';
import type { SessionUser } from '@/lib/auth/session';

/**
 * PAINEL EXECUTIVO DA REDE (Supervisão / Diretoria).
 *
 * Este módulo NÃO calcula nada novo: ele COMPÕE os números que o painel da
 * unidade já mostra. A fonte por unidade é `getUsageBoard` (checklist %,
 * cobertura de desperdício/comandas, ocorrências, notas, cofre, meta, uso), e
 * a agregação da rede segue o mesmo padrão da Visão Executiva (v1.14.0): média
 * simples das % por unidade, soma das contagens. Um painel que mantém a própria
 * versão dos números discorda das telas em três meses — por isso, reaproveitar.
 *
 * As funções de agregação, variação, pontos de atenção e resumo do período são
 * PURAS (recebem as linhas prontas), para serem testadas sem banco e para o
 * núcleo do cálculo não depender de rede.
 */

/** Meses de histórico no gráfico de evolução. */
export const MESES_EVOLUCAO = 6;
/** Queda de performance (p.p.) que vira ponto de atenção — nomeado de propósito. */
const QUEDA_PP = 5;
/** Abaixo disso o uso do SGO é "crítico" — a mesma faixa do semáforo de `getUsageBoard`. */
const USO_BAIXO = 50;

export interface UnidadeExecutiva extends UnitUsageRow {
  checklistsDone: number; // DONE (no prazo)
  checklistsLate: number; // LATE (fora do prazo)
  checklistsMissed: number; // MISSED (não realizadas)
  ocorrenciasAbertas: number; // OPEN + IN_PROGRESS
  ocorrenciasCriticas: number; // HIGH/CRITICAL ainda abertas
  /** Variação (p.p.) vs mês anterior; null quando não havia base. */
  metaDelta: number | null;
  usoDelta: number | null;
  checklistDelta: number | null;
}

export interface ResumoRede {
  unidades: number;
  performance: number; // média das metas das unidades
  uso: number; // média do uso diário
  checklistPctMedio: number; // média do checklist % (mesmo cálculo do painel)
  checklistsDone: number;
  checklistsLate: number;
  checklistsMissed: number;
  noPrazoPct: number; // DONE ÷ (DONE+LATE+MISSED)
  foraPrazoPct: number; // LATE ÷ total
  naoRealizadosPct: number; // MISSED ÷ total
  execucaoPct: number; // (DONE+LATE) ÷ total
  ocorrenciasAbertas: number;
  ocorrenciasCriticas: number;
  comandasCobertura: number; // média
  desperdicioCobertura: number; // média
  notas: number; // soma
  cofre: number; // soma
}

export interface DeltasRede {
  performance: number | null;
  uso: number | null;
  noPrazo: number | null;
}

export type PontoTipo = 'USO_BAIXO' | 'NAO_REALIZADOS' | 'QUEDA_PERFORMANCE' | 'OCORRENCIA_CRITICA' | 'SEM_DESPERDICIO';
export interface PontoDeAtencao {
  unitId: string;
  unitName: string;
  tipo: PontoTipo;
  titulo: string;
  detalhe: string;
  /** Ordena os alertas: 3 = mais grave. */
  severidade: number;
}

export interface ResumoDoPeriodo {
  unidades: number;
  performanceCaiu: number;
  checklistsMelhorou: number;
  ocorrenciasCriticas: number;
  semDesperdicio: number;
  execucaoGeralPct: number;
}

/* ─────────────────────── núcleo puro ─────────────────────── */

function media(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}
function pct(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((parte / total) * 100);
}

/** Agrega as linhas da rede — média simples das %, soma das contagens. */
export function agregarRede(rows: UnidadeExecutiva[]): ResumoRede {
  const done = rows.reduce((s, r) => s + r.checklistsDone, 0);
  const late = rows.reduce((s, r) => s + r.checklistsLate, 0);
  const missed = rows.reduce((s, r) => s + r.checklistsMissed, 0);
  const total = done + late + missed;
  return {
    unidades: rows.length,
    performance: media(rows.map((r) => r.metaPct)),
    uso: media(rows.map((r) => r.usagePct)),
    checklistPctMedio: media(rows.map((r) => r.checklistPct)),
    checklistsDone: done,
    checklistsLate: late,
    checklistsMissed: missed,
    noPrazoPct: pct(done, total),
    foraPrazoPct: pct(late, total),
    naoRealizadosPct: pct(missed, total),
    execucaoPct: pct(done + late, total),
    ocorrenciasAbertas: rows.reduce((s, r) => s + r.ocorrenciasAbertas, 0),
    ocorrenciasCriticas: rows.reduce((s, r) => s + r.ocorrenciasCriticas, 0),
    comandasCobertura: media(rows.map((r) => r.commandsPct)),
    desperdicioCobertura: media(rows.map((r) => r.wastePct)),
    notas: rows.reduce((s, r) => s + r.notes, 0),
    cofre: rows.reduce((s, r) => s + r.cashSessions, 0),
  };
}

/** Variação (p.p.) do resumo atual contra o anterior; null quando não há base. */
export function calcularDeltas(atual: ResumoRede, anterior: ResumoRede | null): DeltasRede {
  if (!anterior || anterior.unidades === 0) return { performance: null, uso: null, noPrazo: null };
  return {
    performance: atual.performance - anterior.performance,
    uso: atual.uso - anterior.uso,
    noPrazo: atual.noPrazoPct - anterior.noPrazoPct,
  };
}

/**
 * Os fatos que a diretoria precisa ver primeiro. Sai SÓ dos dados — cada alerta
 * cita a unidade e os números. Ordenado por gravidade (crítico primeiro).
 */
export function pontosDeAtencao(rows: UnidadeExecutiva[]): PontoDeAtencao[] {
  const pontos: PontoDeAtencao[] = [];
  for (const r of rows) {
    if (r.ocorrenciasCriticas > 0) {
      pontos.push({
        unitId: r.unitId, unitName: r.unitName, tipo: 'OCORRENCIA_CRITICA', severidade: 3,
        titulo: `${r.ocorrenciasCriticas} ocorrência(s) crítica(s) em aberto`,
        detalhe: 'Gravidade alta/crítica ainda sem encerramento.',
      });
    }
    if (r.metaDelta != null && r.metaDelta <= -QUEDA_PP) {
      pontos.push({
        unitId: r.unitId, unitName: r.unitName, tipo: 'QUEDA_PERFORMANCE', severidade: 2,
        titulo: `Queda de ${Math.abs(r.metaDelta)} p.p. na performance`,
        detalhe: `Meta caiu de ${r.metaPct - r.metaDelta}% para ${r.metaPct}% vs mês anterior.`,
      });
    }
    if (r.checklistsMissed > 0 && r.checklistsMissed >= r.checklistsDone) {
      pontos.push({
        unitId: r.unitId, unitName: r.unitName, tipo: 'NAO_REALIZADOS', severidade: 2,
        titulo: `${r.checklistsMissed} checklist(s) não realizado(s)`,
        detalhe: `${r.checklistsDone} concluídos · ${r.checklistsLate} fora do prazo.`,
      });
    }
    if (r.usagePct < USO_BAIXO) {
      pontos.push({
        unitId: r.unitId, unitName: r.unitName, tipo: 'USO_BAIXO', severidade: 1,
        titulo: `Uso do SGO em ${r.usagePct}%`,
        detalhe: 'Abaixo do esperado — o gerente está deixando de usar as ferramentas.',
      });
    }
    if (r.wastePct === 0) {
      pontos.push({
        unitId: r.unitId, unitName: r.unitName, tipo: 'SEM_DESPERDICIO', severidade: 1,
        titulo: 'Sem lançamento de desperdício no período',
        detalhe: 'Nenhum dia com registro de desperdício.',
      });
    }
  }
  return pontos.sort((a, b) => b.severidade - a.severidade || a.unitName.localeCompare(b.unitName, 'pt-BR'));
}

/** Resumo factual do período (frases calculadas, sem opinião). */
export function resumoDoPeriodo(rows: UnidadeExecutiva[]): ResumoDoPeriodo {
  const done = rows.reduce((s, r) => s + r.checklistsDone, 0);
  const late = rows.reduce((s, r) => s + r.checklistsLate, 0);
  const missed = rows.reduce((s, r) => s + r.checklistsMissed, 0);
  return {
    unidades: rows.length,
    performanceCaiu: rows.filter((r) => r.metaDelta != null && r.metaDelta < 0).length,
    checklistsMelhorou: rows.filter((r) => r.checklistDelta != null && r.checklistDelta > 0).length,
    ocorrenciasCriticas: rows.reduce((s, r) => s + r.ocorrenciasCriticas, 0),
    semDesperdicio: rows.filter((r) => r.wastePct === 0).length,
    execucaoGeralPct: pct(done + late, done + late + missed),
  };
}

/* ─────────────────────── wrapper de banco ─────────────────────── */

function mesAnterior(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function ultimosMeses(ym: string, n: number): string[] {
  const [y, m] = ym.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export interface EvolucaoMesRede {
  ym: string;
  performance: number;
  uso: number;
  checklistPct: number;
  ocorrencias: number;
  desperdicio: number;
}

export interface PainelRede {
  ym: string;
  prevYm: string;
  unidades: UnidadeExecutiva[];
  resumo: ResumoRede;
  deltas: DeltasRede;
  pontos: PontoDeAtencao[];
  resumoPeriodo: ResumoDoPeriodo;
  evolucao: EvolucaoMesRede[];
}

/** Agrega um board de `getUsageBoard` no nível da rede (para a evolução). */
function agregarBoard(rows: UnitUsageRow[]): Omit<EvolucaoMesRede, 'ym'> {
  return {
    performance: media(rows.map((r) => r.metaPct)),
    uso: media(rows.map((r) => r.usagePct)),
    checklistPct: media(rows.map((r) => r.checklistPct)),
    ocorrencias: rows.reduce((s, r) => s + r.occurrences, 0),
    desperdicio: media(rows.map((r) => r.wastePct)),
  };
}

export async function getPainelRede(user: SessionUser, ym: string): Promise<PainelRede> {
  const prevYm = mesAnterior(ym);
  const meses = ultimosMeses(ym, MESES_EVOLUCAO);
  /* Um board por mês da janela (o atual e o anterior estão dentro dela). Os
     boards saem em paralelo; cada um reusa exatamente os números do painel. */
  const boards = await Promise.all(meses.map((m) => getUsageBoard(user, m)));
  const boardPorMes = new Map(meses.map((m, i) => [m, boards[i]]));
  const board = boardPorMes.get(ym) ?? [];
  const prevBoard = boardPorMes.get(prevYm) ?? (await getUsageBoard(user, prevYm));

  const ids = board.map((r) => r.unitId);
  const prevIds = prevBoard.map((r) => r.unitId);
  /* Contagens que o board não expõe: DONE/LATE/MISSED (mês atual E anterior — o
     anterior é necessário para o delta de "no prazo" não comparar com zero) e
     ocorrências por status/gravidade do mês atual. Uma consulta cada. */
  const [tasks, tasksPrev, occ] = await Promise.all([
    prisma.taskInstance.groupBy({
      by: ['unitId', 'status'],
      where: { unitId: { in: ids }, operationalDate: { startsWith: ym }, status: { in: ['DONE', 'LATE', 'MISSED'] } },
      _count: true,
    }),
    prisma.taskInstance.groupBy({
      by: ['unitId', 'status'],
      where: { unitId: { in: prevIds }, operationalDate: { startsWith: prevYm }, status: { in: ['DONE', 'LATE', 'MISSED'] } },
      _count: true,
    }),
    prisma.occurrence.groupBy({
      by: ['unitId', 'status', 'gravity'],
      where: { unitId: { in: ids }, operationalDate: { startsWith: ym } },
      _count: true,
    }),
  ]);

  const prevPorUnidade = new Map(prevBoard.map((r) => [r.unitId, r]));
  const taskCount = (unitId: string, status: string) => tasks.find((t) => t.unitId === unitId && t.status === status)?._count ?? 0;
  const taskCountPrev = (unitId: string, status: string) => tasksPrev.find((t) => t.unitId === unitId && t.status === status)?._count ?? 0;
  const abertasDe = (unitId: string) => occ.filter((o) => o.unitId === unitId && (o.status === 'OPEN' || o.status === 'IN_PROGRESS')).reduce((s, o) => s + o._count, 0);
  const criticasDe = (unitId: string) => occ.filter((o) => o.unitId === unitId && (o.status === 'OPEN' || o.status === 'IN_PROGRESS') && (o.gravity === 'HIGH' || o.gravity === 'CRITICAL')).reduce((s, o) => s + o._count, 0);

  const unidades: UnidadeExecutiva[] = board.map((r) => {
    const prev = prevPorUnidade.get(r.unitId) ?? null;
    return {
      ...r,
      checklistsDone: taskCount(r.unitId, 'DONE'),
      checklistsLate: taskCount(r.unitId, 'LATE'),
      checklistsMissed: taskCount(r.unitId, 'MISSED'),
      ocorrenciasAbertas: abertasDe(r.unitId),
      ocorrenciasCriticas: criticasDe(r.unitId),
      metaDelta: prev ? r.metaPct - prev.metaPct : null,
      usoDelta: prev ? r.usagePct - prev.usagePct : null,
      checklistDelta: prev ? r.checklistPct - prev.checklistPct : null,
    };
  });

  const resumo = agregarRede(unidades);
  /* Resumo anterior a partir do board do mês anterior + as contagens
     DONE/LATE/MISSED do mês anterior — assim o delta de "no prazo" compara duas
     porcentagens reais. Ocorrências não entram nos deltas, então ficam em zero. */
  const resumoAnterior = prevBoard.length
    ? agregarRede(prevBoard.map((r) => ({
        ...r,
        checklistsDone: taskCountPrev(r.unitId, 'DONE'),
        checklistsLate: taskCountPrev(r.unitId, 'LATE'),
        checklistsMissed: taskCountPrev(r.unitId, 'MISSED'),
        ocorrenciasAbertas: 0, ocorrenciasCriticas: 0, metaDelta: null, usoDelta: null, checklistDelta: null,
      })))
    : null;

  const evolucao: EvolucaoMesRede[] = meses.map((m) => ({ ym: m, ...agregarBoard(boardPorMes.get(m) ?? []) }));

  return {
    ym,
    prevYm,
    unidades,
    resumo,
    deltas: calcularDeltas(resumo, resumoAnterior),
    pontos: pontosDeAtencao(unidades),
    resumoPeriodo: resumoDoPeriodo(unidades),
    evolucao,
  };
}
