import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { ScheduleVariation } from '@prisma/client';

type Ctx = { ip?: string | null; userAgent?: string | null };
export type PeopleResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' };

export async function listCollaborators(user: SessionUser) {
  return prisma.collaborator.findMany({
    where: { active: true, units: { some: { ...unitScopeWhere(user, 'unitId') } } },
    orderBy: { name: 'asc' },
    include: { units: { include: { unit: { select: { name: true } } } } },
    take: 200,
  });
}

export async function listVacations(user: SessionUser) {
  return prisma.vacation.findMany({
    where: { ...unitScopeWhere(user, 'unitId') },
    orderBy: { startDate: 'asc' },
    include: { collaborator: { select: { name: true } }, unit: { select: { name: true } } },
    take: 200,
  });
}

export async function listSchedule(user: SessionUser) {
  return prisma.scheduleEntry.findMany({
    where: { ...unitScopeWhere(user, 'unitId') },
    orderBy: { date: 'desc' },
    include: { collaborator: { select: { name: true } }, unit: { select: { name: true } } },
    take: 200,
  });
}

/** Gerente solicita alteração de férias (RH é notificado — auditoria). */
export async function requestVacationChange(user: SessionUser, id: string, note: string, ctx: Ctx = {}): Promise<PeopleResult> {
  if (!note?.trim()) return { ok: false, reason: 'INVALID' };
  const v = await prisma.vacation.findUnique({ where: { id }, select: { unitId: true } });
  if (!v) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, v.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.vacation.update({ where: { id }, data: { status: 'CHANGE_REQUESTED', changeNote: note.trim() } });
  await audit({ userId: user.id, unitId: v.unitId, action: 'VACATION_CHANGE_REQUEST', module: 'PEOPLE', entity: 'vacation', entityId: id, metadata: { notify: ['RH'] }, ...ctx });
  return { ok: true };
}

/** Gerente registra variação na escala (planejado nunca é sobrescrito). */
export async function registerVariation(user: SessionUser, id: string, variation: ScheduleVariation, note: string | undefined, ctx: Ctx = {}): Promise<PeopleResult> {
  const e = await prisma.scheduleEntry.findUnique({ where: { id }, select: { unitId: true } });
  if (!e) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, e.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.scheduleEntry.update({ where: { id }, data: { variation, variationNote: note?.trim() || null } });
  await audit({ userId: user.id, unitId: e.unitId, action: 'SCHEDULE_VARIATION', module: 'PEOPLE', entity: 'schedule_entry', entityId: id, metadata: { variation }, ...ctx });
  return { ok: true };
}
