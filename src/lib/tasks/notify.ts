import { prisma } from '@/lib/db/prisma';
import { notifyUsers } from '@/lib/notifications';
import type { Role } from '@prisma/client';

const MANAGER_ROLES: Role[] = ['MANAGER', 'COORDINATOR'];
const TITLE = '⏰ Checklist vence em breve';

/**
 * Avisa ~30 min antes do vencimento de cada checklist ainda PENDENTE.
 * Idempotente: não repete se já existe uma notificação deste título para o
 * mesmo link (/tarefas/{id}). Deve rodar a cada ~10 min no scheduler.
 */
export async function notifyDueSoonTasks(now: Date = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + 30 * 60 * 1000);
  const tasks = await prisma.taskInstance.findMany({
    where: { status: 'PENDING', dueAt: { gt: now, lte: soon } },
    include: { template: { select: { name: true, limitTime: true } }, unit: { select: { name: true } } },
  });

  let sent = 0;
  for (const t of tasks) {
    const link = `/tarefas/${t.id}`;
    // destinatários: dono (individual) ou gerentes da unidade
    let userIds: string[];
    if (t.assignedToId) {
      userIds = [t.assignedToId];
    } else {
      const ms = await prisma.unitMembership.findMany({
        where: { unitId: t.unitId, user: { active: true, role: { in: MANAGER_ROLES } } },
        select: { userId: true },
      });
      userIds = ms.map((m) => m.userId);
    }
    for (const uid of userIds) {
      const already = await prisma.notification.findFirst({ where: { userId: uid, link, title: TITLE }, select: { id: true } });
      if (already) continue;
      await notifyUsers([uid], {
        title: TITLE,
        body: `"${t.template.name}" (${t.unit.name}) vence ${t.template.limitTime ? `às ${t.template.limitTime}` : 'em breve'} — faltam ~30 min.`,
        link,
        module: 'TASKS',
      });
      sent++;
    }
  }
  return sent;
}
