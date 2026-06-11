import { prisma } from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth/password';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { Role, TaskModule } from '@prisma/client';

export type AdminResult = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'CONFLICT' };

type Ctx = { ip?: string | null; userAgent?: string | null };

function isAdmin(user: SessionUser) {
  return user.role === 'ADMIN';
}

/* ───────────────────────────── Unidades ───────────────────────────── */
export async function createUnit(user: SessionUser, input: { name: string; code: string; address?: string; cutoffHour?: number; timezone?: string }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.name?.trim() || !input.code?.trim()) return { ok: false, reason: 'INVALID' };
  const exists = await prisma.unit.findUnique({ where: { code: input.code.trim().toUpperCase() } });
  if (exists) return { ok: false, reason: 'CONFLICT' };
  const u = await prisma.unit.create({
    data: { name: input.name.trim(), code: input.code.trim().toUpperCase(), address: input.address?.trim() || null, cutoffHour: clampHour(input.cutoffHour), timezone: input.timezone?.trim() || 'America/Sao_Paulo' },
  });
  await audit({ userId: user.id, unitId: u.id, action: 'UNIT_CREATE', module: 'CONFIG', entity: 'unit', entityId: u.id, ...ctx });
  return { ok: true, id: u.id };
}

export async function updateUnit(user: SessionUser, id: string, input: { name?: string; address?: string; cutoffHour?: number; timezone?: string; active?: boolean; rhUnitName?: string }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const u = await prisma.unit.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.address !== undefined ? { address: input.address.trim() || null } : {}),
      ...(input.cutoffHour !== undefined ? { cutoffHour: clampHour(input.cutoffHour) } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone.trim() } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.rhUnitName !== undefined ? { rhUnitName: input.rhUnitName.trim() || null } : {}),
    },
  });
  await audit({ userId: user.id, unitId: id, action: 'UNIT_UPDATE', module: 'CONFIG', entity: 'unit', entityId: id, ...ctx });
  return { ok: true, id: u.id };
}

function clampHour(h?: number) {
  const n = Number.isFinite(h) ? Math.trunc(h as number) : 4;
  return Math.min(23, Math.max(0, n));
}

/* ───────────────────────────── Usuários ───────────────────────────── */
export async function createUser(user: SessionUser, input: { name: string; email: string; role: Role; password: string; unitIds?: string[] }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.name?.trim() || !input.email?.trim() || !input.password || input.password.length < 6 || !input.role) return { ok: false, reason: 'INVALID' };
  const email = input.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return { ok: false, reason: 'CONFLICT' };
  const passwordHash = await hashPassword(input.password);
  const created = await prisma.user.create({
    data: { name: input.name.trim(), email, role: input.role, passwordHash, memberships: input.unitIds?.length ? { create: input.unitIds.map((unitId) => ({ unitId })) } : undefined },
  });
  await audit({ userId: user.id, action: 'USER_CREATE', module: 'CONFIG', entity: 'user', entityId: created.id, metadata: { role: input.role }, ...ctx });
  return { ok: true, id: created.id };
}

export async function toggleUser(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (id === user.id) return { ok: false, reason: 'INVALID' }; // não inative a si mesmo
  await prisma.user.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'USER_ACTIVATE' : 'USER_DEACTIVATE', module: 'CONFIG', entity: 'user', entityId: id, ...ctx });
  return { ok: true };
}

export async function setUserUnits(user: SessionUser, id: string, unitIds: string[], ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.$transaction([
    prisma.unitMembership.deleteMany({ where: { userId: id } }),
    prisma.unitMembership.createMany({ data: unitIds.map((unitId) => ({ userId: id, unitId })), skipDuplicates: true }),
  ]);
  await audit({ userId: user.id, action: 'USER_UNITS', module: 'CONFIG', entity: 'user', entityId: id, metadata: { unitIds }, ...ctx });
  return { ok: true };
}

/* ──────────────────────── Checklists (templates) ──────────────────── */
export async function createTemplate(user: SessionUser, input: { unitId: string; name: string; limitTime?: string; weight?: number; module?: TaskModule; requiresEvidence?: boolean; entersMeta?: boolean }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.unitId || !input.name?.trim()) return { ok: false, reason: 'INVALID' };
  const t = await prisma.taskTemplate.create({
    data: {
      unitId: input.unitId, name: input.name.trim(), limitTime: input.limitTime || '23:59',
      weight: Number.isFinite(input.weight) ? Math.max(0, Math.trunc(input.weight as number)) : 1,
      module: input.module ?? 'GENERAL', requiresEvidence: Boolean(input.requiresEvidence), entersMeta: input.entersMeta ?? true,
    },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'TEMPLATE_CREATE', module: 'CONFIG', entity: 'task_template', entityId: t.id, ...ctx });
  return { ok: true, id: t.id };
}

export async function toggleTemplate(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.taskTemplate.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'TEMPLATE_ACTIVATE' : 'TEMPLATE_DEACTIVATE', module: 'CONFIG', entity: 'task_template', entityId: id, ...ctx });
  return { ok: true };
}

/* ──────────────────────── Pagamentos: cadastros ───────────────────── */
export async function createFreelancer(user: SessionUser, input: { name: string; defaultValue: number; unitIds: string[] }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.name?.trim() || !(input.defaultValue > 0) || input.unitIds.length === 0) return { ok: false, reason: 'INVALID' };
  const f = await prisma.freelancer.create({ data: { name: input.name.trim(), defaultValue: input.defaultValue, units: { create: input.unitIds.map((unitId) => ({ unitId })) } } });
  await audit({ userId: user.id, action: 'FREELANCER_CREATE', module: 'CONFIG', entity: 'freelancer', entityId: f.id, ...ctx });
  return { ok: true, id: f.id };
}

export async function toggleFreelancer(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.freelancer.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'FREELANCER_ACTIVATE' : 'FREELANCER_DEACTIVATE', module: 'CONFIG', entity: 'freelancer', entityId: id, ...ctx });
  return { ok: true };
}

export async function createMiscType(user: SessionUser, input: { name: string; approverRole: Role }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.name?.trim() || !input.approverRole) return { ok: false, reason: 'INVALID' };
  const t = await prisma.miscPaymentType.create({ data: { name: input.name.trim(), approverRole: input.approverRole } });
  await audit({ userId: user.id, action: 'MISCTYPE_CREATE', module: 'CONFIG', entity: 'misc_payment_type', entityId: t.id, ...ctx });
  return { ok: true, id: t.id };
}

export async function toggleMiscType(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.miscPaymentType.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'MISCTYPE_ACTIVATE' : 'MISCTYPE_DEACTIVATE', module: 'CONFIG', entity: 'misc_payment_type', entityId: id, ...ctx });
  return { ok: true };
}

export async function createDelegation(user: SessionUser, input: { fromUserId: string; toUserId: string; startsAt: string; endsAt: string }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (!input.fromUserId || !input.toUserId || input.fromUserId === input.toUserId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, reason: 'INVALID' };
  }
  const d = await prisma.approvalDelegation.create({ data: { fromUserId: input.fromUserId, toUserId: input.toUserId, startsAt: start, endsAt: end, createdById: user.id } });
  await audit({ userId: user.id, action: 'DELEGATION_CREATE', module: 'CONFIG', entity: 'approval_delegation', entityId: d.id, metadata: { from: input.fromUserId, to: input.toUserId }, ...ctx });
  return { ok: true, id: d.id };
}

export async function deleteDelegation(user: SessionUser, id: string, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.approvalDelegation.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, action: 'DELEGATION_DELETE', module: 'CONFIG', entity: 'approval_delegation', entityId: id, ...ctx });
  return { ok: true };
}
