import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
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

/**
 * Gerente SOLICITA férias ao RH (item 11, Onda 3 — provisório até a API do RH).
 * Cria a férias com status REQUESTED e notifica os Admins para levar ao RH.
 */
export async function requestVacation(
  user: SessionUser,
  input: { collaboratorId: string; startDate: string; endDate: string; note?: string },
  ctx: Ctx = {},
): Promise<PeopleResult> {
  if (user.role === 'FINANCE') return { ok: false, reason: 'FORBIDDEN' };
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(input.startDate ?? '') || !re.test(input.endDate ?? '') || input.endDate < input.startDate) return { ok: false, reason: 'INVALID' };
  const collab = await prisma.collaborator.findUnique({
    where: { id: input.collaboratorId },
    select: { name: true, units: { select: { unitId: true, unit: { select: { name: true } } } } },
  });
  if (!collab) return { ok: false, reason: 'NOT_FOUND' };
  const unit = collab.units.find((u) => canAccessUnit(user, u.unitId));
  if (!unit) return { ok: false, reason: 'FORBIDDEN' };

  const start = new Date(input.startDate + 'T00:00:00');
  const end = new Date(input.endDate + 'T00:00:00');
  // anti-duplicidade: mesma pessoa com férias cruzando o período
  const overlap = await prisma.vacation.findFirst({
    where: { collaboratorId: input.collaboratorId, startDate: { lte: end }, endDate: { gte: start } },
    select: { id: true },
  });
  if (overlap) return { ok: false, reason: 'INVALID' };

  const v = await prisma.vacation.create({
    data: {
      collaboratorId: input.collaboratorId, unitId: unit.unitId, startDate: start, endDate: end,
      status: 'REQUESTED', changeNote: input.note?.trim() || null,
    },
  });
  await audit({ userId: user.id, unitId: unit.unitId, action: 'VACATION_REQUEST', module: 'PEOPLE', entity: 'vacation', entityId: v.id, metadata: { name: collab.name, start: input.startDate, end: input.endDate }, ...ctx });
  // webhook de férias SGO→RH (inerte sem SGO_WEBHOOK_TOKEN)
  {
    const { sendFeriasWebhook } = await import('@/lib/rh/webhook');
    const full = await prisma.collaborator.findUnique({ where: { id: input.collaboratorId }, select: { cpf: true, externalId: true } });
    const dias = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    void sendFeriasWebhook({
      acao: 'criar', movimento: 'PLANEJAMENTO',
      colaborador: { nome: collab.name, cpf: full?.cpf, matricula: full?.externalId },
      inicio: input.startDate, fim: input.endDate, dias, observacao: input.note ?? null, origem: 'SGO',
    });
  }
  const fmt = (iso: string) => iso.split('-').reverse().join('/');
  await notifyAdmins({
    title: 'Férias solicitadas ao RH',
    body: `${user.name} pediu férias de ${collab.name} (${unit.unit.name}): ${fmt(input.startDate)} a ${fmt(input.endDate)}${input.note?.trim() ? ` — ${input.note.trim()}` : ''}. Leve ao RH.`,
    link: '/modulos/pessoas', module: 'PEOPLE',
  });
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
