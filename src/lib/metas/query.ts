import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getUnitMonthScore } from '@/lib/tasks/summary';
import type { SessionUser } from '@/lib/auth/session';

export interface MetaTaskRow {
  name: string;
  weight: number;
  done: number;
  resolved: number; // done + missed
  scorePct: number;
}

/**
 * Detalhamento da meta do mês por tarefa (Módulo 11).
 * Score por tarefa = realizadas / (realizadas+não realizadas) — só conta o que
 * entra na meta e já foi resolvido (fechamentos excepcionais ficam de fora).
 */
export async function getMetaBreakdown(unitId: string, yearMonth: string): Promise<MetaTaskRow[]> {
  const instances = await prisma.taskInstance.findMany({
    where: {
      unitId,
      operationalDate: { startsWith: yearMonth },
      status: { in: ['DONE', 'MISSED'] },
      template: { entersMeta: true },
    },
    select: { status: true, template: { select: { name: true, weight: true } } },
  });

  const map = new Map<string, { name: string; weight: number; done: number; resolved: number }>();
  for (const i of instances) {
    const key = i.template.name;
    const cur = map.get(key) ?? { name: key, weight: i.template.weight, done: 0, resolved: 0 };
    cur.resolved++;
    if (i.status === 'DONE') cur.done++;
    map.set(key, cur);
  }
  const rows = [...map.values()].map((r) => ({ ...r, scorePct: r.resolved === 0 ? 0 : Math.round((r.done / r.resolved) * 100) }));

  // Linha "Treinamentos" (POPs) — peso único configurável
  const { getTrainingMonthStats, getTrainingWeight } = await import('@/lib/training');
  const [tStats, tWeight] = await Promise.all([getTrainingMonthStats(unitId, yearMonth), getTrainingWeight()]);
  const tResolved = tStats.done + tStats.missed;
  if (tWeight > 0 && tResolved > 0) {
    rows.push({ name: 'Treinamentos (POPs)', weight: tWeight, done: tStats.done, resolved: tResolved, scorePct: Math.round((tStats.done / tResolved) * 100) });
  }

  // Linha "Comunicados" (Central de Comunicação) — peso único configurável
  const { getCommunicationMonthStats, getCommunicationWeight } = await import('@/lib/communications/meta');
  const [cStats, cWeight] = await Promise.all([getCommunicationMonthStats(unitId, yearMonth), getCommunicationWeight()]);
  const cResolved = cStats.done + cStats.missed;
  if (cWeight > 0 && cResolved > 0) {
    rows.push({ name: 'Comunicados', weight: cWeight, done: cStats.done, resolved: cResolved, scorePct: Math.round((cStats.done / cResolved) * 100) });
  }

  // Linha "Avaliações da equipe" — peso configurável (padrão 0 = desligado)
  const { getEvaluationMonthStats, getEvaluationWeight } = await import('@/lib/people/evaluation');
  const [eStats, eWeight] = await Promise.all([getEvaluationMonthStats(unitId, yearMonth), getEvaluationWeight()]);
  const eResolved = eStats.done + eStats.missed;
  if (eWeight > 0 && eResolved > 0) {
    rows.push({ name: 'Avaliações da equipe', weight: eWeight, done: eStats.done, resolved: eResolved, scorePct: Math.round((eStats.done / eResolved) * 100) });
  }

  return rows.sort((a, b) => b.weight - a.weight);
}

export interface MetaRankingRow {
  unitId: string;
  name: string;
  scorePct: number;
}

/** Ranking mensal de metas por unidade (Admin/CEO/Supervisor). */
export async function getMetaRanking(user: SessionUser, yearMonth: string): Promise<MetaRankingRow[]> {
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' } });
  const out: MetaRankingRow[] = [];
  for (const u of units) {
    const s = await getUnitMonthScore(u.id, yearMonth);
    out.push({ unitId: u.id, name: u.name, scorePct: s.scorePct });
  }
  return out.sort((a, b) => b.scorePct - a.scorePct);
}
