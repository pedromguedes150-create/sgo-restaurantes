import { prisma } from '@/lib/db/prisma';
import { computeDueAt } from '@/lib/tasks/due';
import { currentOperationalDate } from '@/lib/date/operational';
import type { Unit } from '@prisma/client';

/**
 * Gera as instâncias de tarefa de uma unidade para um dia operacional.
 *
 * Idempotente: a constraint única (templateId, operationalDate) garante que
 * rodar duas vezes não duplica. Retorna quantas foram criadas.
 *
 * NOTA: o "calendário de operação" (fechamentos excepcionais — regra nº 5) será
 * plugado no Módulo 13. Por ora considera-se que a unidade opera todos os dias.
 */
export async function generateDailyTasksForUnit(
  unit: Pick<Unit, 'id' | 'timezone' | 'cutoffHour'>,
  operationalDate: string,
): Promise<number> {
  const templates = await prisma.taskTemplate.findMany({
    where: { unitId: unit.id, active: true },
  });
  if (templates.length === 0) return 0;

  const cfg = { timezone: unit.timezone, cutoffHour: unit.cutoffHour };

  const result = await prisma.taskInstance.createMany({
    data: templates.map((t) => ({
      templateId: t.id,
      unitId: unit.id,
      operationalDate,
      dueAt: computeDueAt(operationalDate, t.limitTime, cfg),
    })),
    skipDuplicates: true, // idempotência
  });

  return result.count;
}

/** Gera as tarefas do dia operacional atual para todas as unidades ativas. */
export async function generateTodayForAllUnits(now: Date = new Date()): Promise<number> {
  const units = await prisma.unit.findMany({ where: { active: true } });
  let total = 0;
  for (const u of units) {
    const opDate = currentOperationalDate({ timezone: u.timezone, cutoffHour: u.cutoffHour }, now);
    total += await generateDailyTasksForUnit(u, opDate);
  }
  return total;
}
