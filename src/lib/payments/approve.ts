import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyRole, notifyUsers } from '@/lib/notifications';
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
  const req = await prisma.paymentRequest.findUnique({ where: { id }, select: { unitId: true, status: true, approverRole: true, type: true, amount: true, requestedById: true } });
  if (!req) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, req.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (req.status !== 'PENDING') return { ok: false, reason: 'STATE' };
  // Segregação de funções: ninguém aprova a própria solicitação.
  if (req.requestedById === user.id) return { ok: false, reason: 'FORBIDDEN' };
  const roles = await approverRolesFor(user);
  if (!roles.has(req.approverRole)) return { ok: false, reason: 'FORBIDDEN' };

  const res = await prisma.paymentRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() },
  });
  if (res.count === 0) return { ok: false, reason: 'STATE' };

  await audit({ userId: user.id, unitId: req.unitId, action: 'PAYMENT_APPROVE', module: 'PAYMENTS', entity: 'payment_request', entityId: id, metadata: { type: req.type, notify: ['FINANCE'] }, ...ctx });
  // Aprovado → Financeiro processa; solicitante fica sabendo
  await notifyRole('FINANCE', {
    title: 'Pagamento aprovado — processar',
    body: `Solicitação de R$ ${Number(req.amount).toFixed(2)} aprovada por ${user.name}.`,
    link: '/modulos/pagamentos',
    module: 'PAYMENTS',
  });
  if (req.requestedById) {
    await notifyUsers([req.requestedById], {
      title: 'Sua solicitação foi aprovada',
      body: `Pagamento de R$ ${Number(req.amount).toFixed(2)} aprovado por ${user.name}.`,
      link: '/modulos/pagamentos',
      module: 'PAYMENTS',
    });
  }
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
  const rejected = await prisma.paymentRequest.findUnique({ where: { id }, select: { requestedById: true, rejectionReason: true } });
  if (rejected?.requestedById) {
    await notifyUsers([rejected.requestedById], {
      title: 'Sua solicitação foi rejeitada',
      body: `Motivo: ${rejected.rejectionReason ?? '—'}`,
      link: '/modulos/pagamentos',
      module: 'PAYMENTS',
    });
  }
  return { ok: true };
}

/** Financeiro/Admin marca como paga. */
export async function markPaid(user: SessionUser, id: string, ctx: Ctx = {}): Promise<PayActionResult> {
  if (user.role !== 'FINANCE' && user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const req = await prisma.paymentRequest.findUnique({ where: { id }, select: { unitId: true, status: true, requestedById: true, amount: true } });
  if (!req) return { ok: false, reason: 'NOT_FOUND' };
  if (req.status !== 'APPROVED') return { ok: false, reason: 'STATE' };

  const res = await prisma.paymentRequest.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'PAID', paidById: user.id, paidAt: new Date() } });
  if (res.count === 0) return { ok: false, reason: 'STATE' };
  await audit({ userId: user.id, unitId: req.unitId, action: 'PAYMENT_PAID', module: 'PAYMENTS', entity: 'payment_request', entityId: id, ...ctx });
  if (req.requestedById) {
    await notifyUsers([req.requestedById], {
      title: 'Pagamento realizado',
      body: `O pagamento de R$ ${Number(req.amount).toFixed(2)} foi efetuado.`,
      link: '/modulos/pagamentos',
      module: 'PAYMENTS',
    });
  }
  return { ok: true };
}

/* ───────── Admin: editar / excluir histórico (Módulo 7) ───────── */
export async function adminEditPayment(user: SessionUser, id: string, input: { amount?: number; description?: string }, ctx: Ctx = {}): Promise<PayActionResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const p = await prisma.paymentRequest.findUnique({ where: { id }, select: { unitId: true } });
  if (!p) return { ok: false, reason: 'NOT_FOUND' };
  if (input.amount !== undefined && !(input.amount > 0)) return { ok: false, reason: 'INVALID' };
  await prisma.paymentRequest.update({
    where: { id },
    data: {
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
    },
  });
  await audit({ userId: user.id, unitId: p.unitId, action: 'PAYMENT_ADMIN_EDIT', module: 'PAYMENTS', entity: 'payment_request', entityId: id, metadata: { fields: Object.keys(input) }, ...ctx });
  return { ok: true };
}

export async function adminDeletePayment(user: SessionUser, id: string, ctx: Ctx = {}): Promise<PayActionResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const p = await prisma.paymentRequest.findUnique({ where: { id }, select: { unitId: true } });
  if (!p) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.paymentRequest.delete({ where: { id } });
  await audit({ userId: user.id, unitId: p.unitId, action: 'PAYMENT_ADMIN_DELETE', module: 'PAYMENTS', entity: 'payment_request', entityId: id, ...ctx });
  return { ok: true };
}
