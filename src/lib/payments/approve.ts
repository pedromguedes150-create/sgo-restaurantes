import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { Role } from '@prisma/client';

type Ctx = { ip?: string | null; userAgent?: string | null };
export type PayActionResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' | 'STATE' };

/**
 * Papéis de aprovação que o usuário pode exercer agora — inclui DELEGAÇÃO ativa
 * (substituto por período recebe a capacidade do delegante). Módulo 7.
 */
export async function approverRolesFor(user: SessionUser, now: Date = new Date()): Promise<Set<Role>> {
  const roles = new Set<Role>([user.role]);
  if (user.role === 'ADMIN' || user.role === 'CEO') {
    (['SUPERVISOR', 'ADMIN', 'COORDINATOR', 'MANAGER', 'FINANCE', 'CEO'] as Role[]).forEach((r) => roles.add(r));
  }
  const delegs = await prisma.approvalDelegation.findMany({
    where: { toUserId: user.id, startsAt: { lte: now }, endsAt: { gte: now } },
    include: { fromUser: { select: { role: true } } },
  });
  for (const d of delegs) roles.add(d.fromUser.role);
  return roles;
}

export async function canApprove(user: SessionUser, requestId: string): Promise<boolean> {
  const req = await prisma.paymentRequest.findUnique({ where: { id: requestId }, select: { unitId: true, status: true, approverRole: true } });
  if (!req || req.status !== 'PENDING' || !canAccessUnit(user, req.unitId)) return false;
  const roles = await approverRolesFor(user);
  return roles.has(req.approverRole);
}

export async function approveRequest(user: SessionUser, id: string, ctx: Ctx = {}): Promise<PayActionResult> {
  const req = await prisma.paymentRequest.findUnique({ where: { id }, select: { unitId: true, status: true, approverRole: true, type: true, amount: true } });
  if (!req) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, req.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (req.status !== 'PENDING') return { ok: false, reason: 'STATE' };
  const roles = await approverRolesFor(user);
  if (!roles.has(req.approverRole)) return { ok: false, reason: 'FORBIDDEN' };

  const res = await prisma.paymentRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() },
  });
  if (res.count === 0) return { ok: false, reason: 'STATE' };

  await audit({ userId: user.id, unitId: req.unitId, action: 'PAYMENT_APPROVE', module: 'PAYMENTS', entity: 'payment_request', entityId: id, metadata: { type: req.type, notify: ['FINANCE'] }, ...ctx });
  return { ok: true };
}

export async function rejectRequest(user: SessionUser, id: string, reason: string, ctx: Ctx = {}): Promise<PayActionResult> {
  if (!reason?.trim()) return { ok: false, reason: 'INVALID' };
  const req = await prisma.paymentRequest.findUnique({ where: { id }, select: { unitId: true, status: true, approverRole: true } });
  if (!req) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, req.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (req.status !== 'PENDING') return { ok: false, reason: 'STATE' };
  const roles = await approverRolesFor(user);
  if (!roles.has(req.approverRole)) return { ok: false, reason: 'FORBIDDEN' };

  const res = await prisma.paymentRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'REJECTED', approvedById: user.id, approvedAt: new Date(), rejectionReason: reason.trim() },
  });
  if (res.count === 0) return { ok: false, reason: 'STATE' };
  await audit({ userId: user.id, unitId: req.unitId, action: 'PAYMENT_REJECT', module: 'PAYMENTS', entity: 'payment_request', entityId: id, ...ctx });
  return { ok: true };
}

/** Financeiro/Admin marca como paga. */
export async function markPaid(user: SessionUser, id: string, ctx: Ctx = {}): Promise<PayActionResult> {
  if (user.role !== 'FINANCE' && user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const req = await prisma.paymentRequest.findUnique({ where: { id }, select: { unitId: true, status: true } });
  if (!req) return { ok: false, reason: 'NOT_FOUND' };
  if (req.status !== 'APPROVED') return { ok: false, reason: 'STATE' };

  const res = await prisma.paymentRequest.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'PAID', paidById: user.id, paidAt: new Date() } });
  if (res.count === 0) return { ok: false, reason: 'STATE' };
  await audit({ userId: user.id, unitId: req.unitId, action: 'PAYMENT_PAID', module: 'PAYMENTS', entity: 'payment_request', entityId: id, ...ctx });
  return { ok: true };
}
