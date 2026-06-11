import { prisma } from '@/lib/db/prisma';
import { approverRolesFor } from '@/lib/payments/approve';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';

const REQUEST_INCLUDE = {
  unit: { select: { name: true, code: true } },
  requestedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
  freelancer: { select: { name: true } },
  miscType: { select: { name: true } },
} satisfies Prisma.PaymentRequestInclude;

/** Escopo de pagamentos: FINANCE e CEO/ADMIN veem toda a rede; demais, suas unidades. */
function paymentScope(user: SessionUser): Prisma.PaymentRequestWhereInput {
  if (user.seesAllUnits || user.role === 'FINANCE') return {};
  return { unitId: { in: user.unitIds } };
}

/** "Minhas Solicitações" */
export async function getMyRequests(user: SessionUser) {
  return prisma.paymentRequest.findMany({
    where: { requestedById: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: REQUEST_INCLUDE,
  });
}

/** "Para Aprovar" — pendentes que este usuário pode aprovar (inclui delegação). */
export async function getToApprove(user: SessionUser) {
  const roles = await approverRolesFor(user);
  const isAdminLike = user.role === 'ADMIN' || user.role === 'CEO';
  return prisma.paymentRequest.findMany({
    where: {
      status: 'PENDING',
      ...paymentScope(user),
      ...(isAdminLike ? {} : { approverRole: { in: [...roles] } }),
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: REQUEST_INCLUDE,
  });
}

/** Fila do Financeiro: aprovadas aguardando pagamento. */
export async function getToPay(user: SessionUser) {
  if (user.role !== 'FINANCE' && user.role !== 'ADMIN' && user.role !== 'CEO') return [];
  return prisma.paymentRequest.findMany({
    where: { status: 'APPROVED', ...paymentScope(user) },
    orderBy: { approvedAt: 'asc' },
    take: 100,
    include: REQUEST_INCLUDE,
  });
}

/** Histórico (resolvidas). */
export async function getHistory(user: SessionUser) {
  return prisma.paymentRequest.findMany({
    where: { status: { in: ['APPROVED', 'REJECTED', 'PAID'] }, ...paymentScope(user) },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: REQUEST_INCLUDE,
  });
}

export async function getToApproveCount(user: SessionUser): Promise<number> {
  const roles = await approverRolesFor(user);
  const isAdminLike = user.role === 'ADMIN' || user.role === 'CEO';
  return prisma.paymentRequest.count({
    where: { status: 'PENDING', ...paymentScope(user), ...(isAdminLike ? {} : { approverRole: { in: [...roles] } }) },
  });
}

export async function getFreelancersForUnit(unitId: string) {
  return prisma.freelancer.findMany({
    where: { active: true, units: { some: { unitId } } },
    select: { id: true, name: true, defaultValue: true },
    orderBy: { name: 'asc' },
  });
}

export async function getMiscTypes() {
  return prisma.miscPaymentType.findMany({ where: { active: true }, orderBy: { order: 'asc' }, select: { id: true, name: true } });
}
