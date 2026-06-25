import { prisma } from '@/lib/db/prisma';
import { computeDueAt } from '@/lib/tasks/due';
import { currentOperationalDate, operationalDate as opDateOf } from '@/lib/date/operational';
import type { Unit, Role } from '@prisma/client';

/** Perfis considerados "gerentes" para checklists individuais (scope MANAGER). */
const MANAGER_ROLES: Role[] = ['MANAGER', 'COORDINATOR'];

/**
 * Gera as instâncias de tarefa de uma unidade para um dia operacional.
 * Idempotente (verifica existência por modelo/dia[/gerente] antes de criar).
 * - scope UNIT    → 1 instância por modelo/dia (qualquer gerente conclui).
 * - scope MANAGER → 1 instância por gerente da unidade/dia (checklist individual).
 * - limitTime NULL → vale até o fim do dia operacional (23:59).
 */
export async function generateDailyTasksForUnit(
  unit: Pick<Unit, 'id' | 'timezone' | 'cutoffHour'>,
  operationalDate: string,
): Promise<number> {
  // Trava de geração:
  //  - dentro de [startDate, endDate] (programação), quando definidos;
  //  - NUNCA antes do dia em que o checklist foi criado (evita "passado" em
  //    checklists novos e a ressurreição de execuções excluídas no histórico).
  const cfgUnit = { timezone: unit.timezone, cutoffHour: unit.cutoffHour };
  const templates = (await prisma.taskTemplate.findMany({ where: { unitId: unit.id, active: true } }))
    .filter((t) => {
      const createdOp = opDateOf(t.createdAt, cfgUnit);
      return operationalDate >= createdOp
        && (!t.startDate || operationalDate >= t.startDate)
        && (!t.endDate || operationalDate <= t.endDate);
    });
  if (templates.length === 0) return 0;

  const cfg = { timezone: unit.timezone, cutoffHour: unit.cutoffHour };
  const hasManagerScope = templates.some((t) => t.scope === 'MANAGER');
  const managers = hasManagerScope
    ? await prisma.user.findMany({ where: { active: true, role: { in: MANAGER_ROLES }, memberships: { some: { unitId: unit.id } } }, select: { id: true } })
    : [];

  let created = 0;
  for (const t of templates) {
    const dueAt = computeDueAt(operationalDate, t.limitTime ?? '23:59', cfg);
    if (t.scope === 'MANAGER') {
      for (const m of managers) {
        const exists = await prisma.taskInstance.findFirst({ where: { templateId: t.id, operationalDate, assignedToId: m.id }, select: { id: true } });
        if (!exists) { await prisma.taskInstance.create({ data: { templateId: t.id, unitId: unit.id, operationalDate, dueAt, assignedToId: m.id } }); created++; }
      }
    } else {
      const exists = await prisma.taskInstance.findFirst({ where: { templateId: t.id, operationalDate, assignedToId: null }, select: { id: true } });
      if (!exists) { await prisma.taskInstance.create({ data: { templateId: t.id, unitId: unit.id, operationalDate, dueAt } }); created++; }
    }
  }
  return created;
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
