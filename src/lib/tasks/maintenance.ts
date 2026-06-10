import { prisma } from '@/lib/db/prisma';
import { currentOperationalDate } from '@/lib/date/operational';

/**
 * Marca como "Não realizada" (MISSED) toda tarefa PENDENTE de um dia operacional
 * já encerrado (passou da hora de corte — regra do Módulo 1). MISSED entra na meta.
 *
 * Idempotente e seguro para rodar por job agendado a cada hora de corte.
 */
export async function markMissedTasks(now: Date = new Date()): Promise<number> {
  const units = await prisma.unit.findMany({ where: { active: true } });
  let total = 0;

  for (const u of units) {
    const current = currentOperationalDate({ timezone: u.timezone, cutoffHour: u.cutoffHour }, now);
    const res = await prisma.taskInstance.updateMany({
      where: { unitId: u.id, status: 'PENDING', operationalDate: { lt: current } },
      data: { status: 'MISSED' },
    });
    total += res.count;
  }

  return total;
}
