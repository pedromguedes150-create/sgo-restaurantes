import { prisma } from '@/lib/db/prisma';
import { currentOperationalDate } from '@/lib/date/operational';
import { generateDailyTasksForUnit } from '@/lib/tasks/generate';
import { ensureTaskMaintenance } from '@/lib/tasks/maintenance';
import { getUnitDaySummary, type DaySummary, type MonthScore } from '@/lib/tasks/summary';
import { componentesDaMeta, descontosDaMeta } from '@/lib/metas/componentes';
import { pontuar } from '@/lib/metas/pontuacao';
import { metaDaUnidade, type MetaDaUnidade } from '@/lib/metas/meta-por-usuario';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import type { Unit } from '@prisma/client';
import { emLotes, PARALELO_POR_UNIDADE } from '@/lib/async/em-lotes';

export interface UnitOverview {
  unit: Pick<Unit, 'id' | 'name' | 'code'>;
  operationalDate: string;
  summary: DaySummary;
  monthScore: MonthScore;
  /** v1.207.0 — a nota aberta em componentes e descontos (a mesma conta de `monthScore`, lida uma vez só). */
  meta: MetaDaUnidade;
}

/**
 * Visão consolidada por unidade (dashboard CEO/Admin/Supervisor) — respeitando o
 * escopo por unidade. Para cada unidade acessível: semáforo do dia + score do mês.
 */
export async function getUnitsOverview(
  user: SessionUser,
  now: Date = new Date(),
): Promise<UnitOverview[]> {
  await ensureTaskMaintenance(false, now); // backfill + MISSED automáticos (throttled)
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
  });

  /* Unidades em paralelo limitado (v1.158.1): era uma por vez, e cada uma faz
     geração do dia + resumo do dia + nota do mês (~15 consultas). A ordem de
     saída é a das unidades (alfabética), como antes. */
  return emLotes(units, PARALELO_POR_UNIDADE, async (u) => {
    const cfg = { timezone: u.timezone, cutoffHour: u.cutoffHour };
    const operationalDate = currentOperationalDate(cfg, now);
    await generateDailyTasksForUnit(u, operationalDate); // geração preguiçosa
    const ym = operationalDate.slice(0, 7);
    /* Componentes e descontos lidos UMA vez: a nota (`pontuar`, o mesmo de
       getUnitMonthScore) e o detalhamento saem da mesma leitura. */
    const [summary, componentes, descontos] = await Promise.all([
      getUnitDaySummary(u.id, operationalDate, now),
      componentesDaMeta(u.id, ym),
      descontosDaMeta(u.id, ym),
    ]);
    const monthScore = pontuar(componentes, descontos.lista);
    const meta = metaDaUnidade(u.id, u.name, componentes, descontos.lista);
    return { unit: { id: u.id, name: u.name, code: u.code }, operationalDate, summary, monthScore, meta };
  });
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
