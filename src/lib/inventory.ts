import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

export async function listInventory(user: SessionUser) {
  return prisma.inventorySchedule.findMany({
    where: { ...unitScopeWhere(user, 'unitId') },
    orderBy: [{ status: 'asc' }, { scheduledDate: 'desc' }],
    take: 100,
    include: { unit: { select: { name: true } }, responsible: { select: { name: true } }, confirmedBy: { select: { name: true } } },
  });
}

export type InvResult = { ok: true; id?: string } | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' | 'STATE' };

/** Admin agenda inventário (categoria, unidade, data, responsável). */
export async function scheduleInventory(
  user: SessionUser,
  input: { unitId: string; categoryName: string; scheduledDate: string; responsibleId?: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<InvResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!input.unitId || !input.categoryName?.trim() || !input.scheduledDate) return { ok: false, reason: 'INVALID' };
  const s = await prisma.inventorySchedule.create({
    data: { unitId: input.unitId, categoryName: input.categoryName.trim(), scheduledDate: input.scheduledDate, responsibleId: input.responsibleId || null },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'INVENTORY_SCHEDULE', module: 'INVENTORY', entity: 'inventory_schedule', entityId: s.id, ...ctx });
  return { ok: true, id: s.id };
}

/** Gerente/responsável confirma a execução do inventário. */
export async function confirmInventory(
  user: SessionUser,
  id: string,
  observation: string | undefined,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<InvResult> {
  const s = await prisma.inventorySchedule.findUnique({ where: { id }, select: { unitId: true, status: true } });
  if (!s) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, s.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (s.status === 'DONE') return { ok: false, reason: 'STATE' };
  await prisma.inventorySchedule.update({ where: { id }, data: { status: 'DONE', confirmedById: user.id, confirmedAt: new Date(), observation: observation?.trim() || null } });
  await audit({ userId: user.id, unitId: s.unitId, action: 'INVENTORY_DONE', module: 'INVENTORY', entity: 'inventory_schedule', entityId: id, ...ctx });
  return { ok: true };
}
