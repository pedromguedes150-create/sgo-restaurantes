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
  scorePct: number; // Σ(peso × realizado ÷ resolvido) ÷ Σ(peso) × 100, menos os descontos
  doneWeight: number;
  resolvedWeight: number; // Σ dos pesos que entraram na conta no mês
}

/**
 * Nota da meta do mês (Módulo 11).
 *
 * v1.174.0: a conta vive em `metas/pontuacao.ts` (pura) sobre a lista de
 * `metas/componentes.ts` — Checklists do dia com UM peso (cada checklist que
 * entra na meta vale igual: realizados ÷ realizados + não realizados), mais as
 * coberturas e os componentes de gestão, cada um com o seu peso configurado.
 * Componente com peso 0 ou sem nada resolvido no mês fica fora. Depois, os
 * descontos diretos (fora do prazo; gerente sem folga). O detalhamento
 * (`getMetaBreakdown`) lê a MESMA lista: as duas telas não podem discordar.
 */
export async function getUnitMonthScore(
  unitId: string,
  yearMonth: string, // 'YYYY-MM'
): Promise<MonthScore> {
  const [{ componentesDaMeta, descontosDaMeta }, { pontuar }] = await Promise.all([import('@/lib/metas/componentes'), import('@/lib/metas/pontuacao')]);
  const [componentes, descontos] = await Promise.all([componentesDaMeta(unitId, yearMonth), descontosDaMeta(unitId, yearMonth)]);
  return pontuar(componentes, descontos.lista);
}
