import { prisma } from '@/lib/db/prisma';
import { currentOperationalDate } from '@/lib/date/operational';
import { generateDailyTasksForUnit } from '@/lib/tasks/generate';
import { getUnitDaySummary, getUnitMonthScore, type DaySummary, type MonthScore } from '@/lib/tasks/summary';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import type { Unit } from '@prisma/client';

export interface UnitOverview {
  unit: Pick<Unit, 'id' | 'name' | 'code'>;
  operationalDate: string;
  summary: DaySummary;
  monthScore: MonthScore;
}

/**
 * Visão consolidada por unidade (dashboard CEO/Admin/Supervisor) — respeitando o
 * escopo por unidade. Para cada unidade acessível: semáforo do dia + score do mês.
 */
export async function getUnitsOverview(
  user: SessionUser,
  now: Date = new Date(),
): Promise<UnitOverview[]> {
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
  });

  const out: UnitOverview[] = [];
  for (const u of units) {
    const cfg = { timezone: u.timezone, cutoffHour: u.cutoffHour };
    const operationalDate = currentOperationalDate(cfg, now);
    await generateDailyTasksForUnit(u, operationalDate); // geração preguiçosa

    const summary = await getUnitDaySummary(u.id, operationalDate, now);
    const monthScore = await getUnitMonthScore(u.id, operationalDate.slice(0, 7));

    out.push({ unit: { id: u.id, name: u.name, code: u.code }, operationalDate, summary, monthScore });
  }
  return out;
}

/** Agrega o dia de várias unidades (para o anel do gerente multi-unidade). */
export function aggregateDay(overviews: UnitOverview[]) {
  const total = overviews.reduce((s, o) => s + o.summary.total, 0);
  const done = overviews.reduce((s, o) => s + o.summary.done, 0);
  const missed = overviews.reduce((s, o) => s + o.summary.missed, 0);
  const overdue = overviews.reduce((s, o) => s + o.summary.overdue, 0);
  const pending = overviews.reduce((s, o) => s + o.summary.pending, 0);
  const progressPct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, missed, overdue, pending, progressPct };
}
