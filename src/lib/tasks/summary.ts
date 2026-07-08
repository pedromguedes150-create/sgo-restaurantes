import { prisma } from '@/lib/db/prisma';

export type SummaryTone = 'success' | 'medium' | 'critical' | 'neutral';

export interface DaySummary {
  unitId: string;
  total: number;
  done: number;
  missed: number;
  pending: number;
  overdue: number; // pendentes com prazo vencido
  progressPct: number; // done / total
  tone: SummaryTone; // semáforo do dia
}

/** Resumo das tarefas de um dia operacional por unidade (para o dashboard). */
export async function getUnitDaySummary(
  unitId: string,
  operationalDate: string,
  now: Date = new Date(),
): Promise<DaySummary> {
  const instances = await prisma.taskInstance.findMany({
    where: { unitId, operationalDate },
    select: { status: true, dueAt: true },
  });

  const total = instances.length;
  const done = instances.filter((i) => i.status === 'DONE').length;
  const missed = instances.filter((i) => i.status === 'MISSED').length;
  const pending = instances.filter((i) => i.status === 'PENDING').length;
  const overdue = instances.filter((i) => i.status === 'PENDING' && i.dueAt < now).length;
  const progressPct = total === 0 ? 0 : Math.round((done / total) * 100);

  // Semáforo (regra do dashboard CEO/Admin):
  // 🟢 tudo concluído · 🟡 pendências no prazo · 🔴 atraso/não realizada
  let tone: SummaryTone = 'neutral';
  if (total > 0) {
    if (missed > 0 || overdue > 0) tone = 'critical';
    else if (pending > 0) tone = 'medium';
    else tone = 'success';
  }

  return { unitId, total, done, missed, pending, overdue, progressPct, tone };
}

export interface MonthScore {
  scorePct: number; // Σ(realizadas×peso) / Σ(resolvidas×peso) × 100
  doneWeight: number;
  resolvedWeight: number; // done + missed (dias já encerrados)
}

/**
 * Score de meta do mês (Módulo 11, versão base).
 * Score = Σ (realizadas × peso) / Σ (previstas × peso) × 100
 * "Previstas" aqui = tarefas que entram na meta e já foram resolvidas
 * (DONE ou MISSED). Tarefas ainda pendentes do dia não penalizam.
 * Fechamentos excepcionais não geram tarefa, logo já ficam fora (regra nº 5/11).
 */
export async function getUnitMonthScore(
  unitId: string,
  yearMonth: string, // 'YYYY-MM'
): Promise<MonthScore> {
  const instances = await prisma.taskInstance.findMany({
    where: {
      unitId,
      operationalDate: { startsWith: yearMonth },
      status: { in: ['DONE', 'MISSED'] },
      template: { entersMeta: true },
    },
    select: { status: true, template: { select: { weight: true } } },
  });

  let doneWeight = 0;
  let resolvedWeight = 0;
  for (const i of instances) {
    const w = i.template.weight;
    resolvedWeight += w;
    if (i.status === 'DONE') doneWeight += w;
  }

  // Componente "Treinamentos" (POPs) — peso único configurável.
  const { getTrainingMonthStats, getTrainingWeight } = await import('@/lib/training');
  const [tStats, tWeight] = await Promise.all([getTrainingMonthStats(unitId, yearMonth), getTrainingWeight()]);
  const tResolved = tStats.done + tStats.missed;
  if (tResolved > 0 && tWeight > 0) {
    resolvedWeight += tWeight;
    doneWeight += tWeight * (tStats.done / tResolved);
  }

  // Componente "Comunicados" (Central de Comunicação) — peso único configurável.
  const { getCommunicationMonthStats, getCommunicationWeight } = await import('@/lib/communications/meta');
  const [cStats, cWeight] = await Promise.all([getCommunicationMonthStats(unitId, yearMonth), getCommunicationWeight()]);
  const cResolved = cStats.done + cStats.missed;
  if (cResolved > 0 && cWeight > 0) {
    resolvedWeight += cWeight;
    doneWeight += cWeight * (cStats.done / cResolved);
  }

  // Componente "Avaliações da equipe" — peso configurável (padrão 0 = desligado).
  const { getEvaluationMonthStats, getEvaluationWeight } = await import('@/lib/people/evaluation');
  const [eStats, eWeight] = await Promise.all([getEvaluationMonthStats(unitId, yearMonth), getEvaluationWeight()]);
  const eResolved = eStats.done + eStats.missed;
  if (eResolved > 0 && eWeight > 0) {
    resolvedWeight += eWeight;
    doneWeight += eWeight * (eStats.done / eResolved);
  }

  let scorePct = resolvedWeight === 0 ? 0 : Math.round((doneWeight / resolvedWeight) * 100);

  // Penalidade "lançamento fora do prazo" (item 4, 07/07): cada data editada
  // por Admin/Supervisor (Pagamentos/Notas/Gás/Óleo) desconta X% da meta.
  const { countLateEntries, getLateEntryPenaltyPct } = await import('@/lib/late-entry');
  const [lateCount, penaltyPct] = await Promise.all([countLateEntries(unitId, yearMonth), getLateEntryPenaltyPct()]);
  if (lateCount > 0 && penaltyPct > 0) {
    scorePct = Math.max(0, Math.round(scorePct - lateCount * penaltyPct));
  }

  return { scorePct, doneWeight, resolvedWeight };
}
