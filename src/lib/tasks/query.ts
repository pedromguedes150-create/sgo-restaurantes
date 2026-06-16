import { prisma } from '@/lib/db/prisma';
import { currentOperationalDate } from '@/lib/date/operational';
import { generateDailyTasksForUnit } from '@/lib/tasks/generate';
import { ensureTaskMaintenance } from '@/lib/tasks/maintenance';
import { getUnitDaySummary, type DaySummary } from '@/lib/tasks/summary';
import type { SessionUser } from '@/lib/auth/session';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { TaskInstance, TaskTemplate, Unit } from '@prisma/client';

export type TaskWithTemplate = TaskInstance & { template: TaskTemplate };

export interface UnitTasksToday {
  unit: Pick<Unit, 'id' | 'name' | 'code' | 'timezone' | 'cutoffHour'>;
  operationalDate: string;
  summary: DaySummary;
  tasks: TaskWithTemplate[];
}

/**
 * Tarefas do dia operacional para todas as unidades acessíveis ao usuário.
 * Gera as instâncias sob demanda se ainda não existirem (até termos o job/cron).
 * Escopo por unidade aplicado no servidor (regra nº 3).
 */
export async function getTasksTodayForUser(
  user: SessionUser,
  now: Date = new Date(),
): Promise<UnitTasksToday[]> {
  await ensureTaskMaintenance(false, now); // backfill + MISSED automáticos (throttled)
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
  });

  const out: UnitTasksToday[] = [];
  for (const u of units) {
    const cfg = { timezone: u.timezone, cutoffHour: u.cutoffHour };
    const operationalDate = currentOperationalDate(cfg, now);

    // geração preguiçosa (idempotente)
    await generateDailyTasksForUnit(u, operationalDate);

    const tasks = await prisma.taskInstance.findMany({
      // checklists da unidade (assignedToId null) + os individuais DESTE usuário
      where: { unitId: u.id, operationalDate, OR: [{ assignedToId: null }, { assignedToId: user.id }] },
      include: { template: true },
      orderBy: [{ template: { order: 'asc' } }, { dueAt: 'asc' }],
    });

    const summary = await getUnitDaySummary(u.id, operationalDate, now);
    out.push({
      unit: { id: u.id, name: u.name, code: u.code, timezone: u.timezone, cutoffHour: u.cutoffHour },
      operationalDate,
      summary,
      tasks,
    });
  }
  return out;
}
