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

/** Histórico (resolvidas) — ordenado pela data da SOLICITAÇÃO, mais nova primeiro (pedido 07/07). */
export async function getHistory(user: SessionUser) {
  return prisma.paymentRequest.findMany({
    where: { status: { in: ['APPROVED', 'REJECTED', 'PAID'] }, ...paymentScope(user) },
    orderBy: { createdAt: 'desc' },
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

/* ───────────────────────── Consolidação mensal de freelancers ───────────────────────── */
export interface FreelancerPayLine { id: string; date: string; unit: string; status: string; amount: number; divergent: boolean; standardValue: number | null }
export interface FreelancerConsolidationGroup { freelancerId: string; name: string; pixKey: string | null; count: number; total: number; lines: FreelancerPayLine[] }
export interface FreelancerConsolidation { yearMonth: string; groups: FreelancerConsolidationGroup[]; grandTotal: number; grandCount: number }

const PAY_STATUS_LABEL: Record<string, string> = { PENDING: 'Pendente', APPROVED: 'Aprovada', PAID: 'Paga', REJECTED: 'Rejeitada' };

/**
 * Consolidação mensal de pagamentos de freelancers para envio ao Financeiro.
 * Considera solicitações APROVADAS e PAGAS (o que será/foi pago), agrupadas por
 * freelancer com a chave PIX e o total. Filtra pelo mês de lançamento (createdAt).
 */
/**
 * Consolidação de freelancers por MÊS ou por PERÍODO (semana, 16/07):
 * passe range {from,to} (YYYY-MM-DD, inclusivo) para fechamento semanal
 * (segunda→domingo, pago na segunda). Filtra pelo DIA DO TRABALHO quando
 * houver (workDate), senão pela criação.
 */
export async function getFreelancerConsolidation(user: SessionUser, yearMonth: string, unitId?: string, range?: { from: string; to: string }): Promise<FreelancerConsolidation> {
  let start: Date; let end: Date;
  if (range) {
    start = new Date(range.from + 'T00:00:00Z');
    end = new Date(new Date(range.to + 'T00:00:00Z').getTime() + 86400000);
  } else {
    const [y, m] = yearMonth.split('-').map(Number);
    start = new Date(Date.UTC(y, m - 1, 1));
    end = new Date(Date.UTC(y, m, 1));
  }
  const rows = await prisma.paymentRequest.findMany({
    where: {
      type: 'FREELANCER',
      status: { in: ['APPROVED', 'PAID'] },
      OR: [
        { workDate: { gte: start, lt: end } },
        { workDate: null, createdAt: { gte: start, lt: end } },
      ],
      ...paymentScope(user),
      ...(unitId ? { unitId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    include: { unit: { select: { name: true } }, freelancer: { select: { id: true, name: true, pixKey: true } } },
  });

  const map = new Map<string, FreelancerConsolidationGroup>();
  let grandTotal = 0;
  for (const r of rows) {
    const key = r.freelancerId ?? r.id;
    const name = r.freelancer?.name ?? 'Freelancer';
    const g = map.get(key) ?? { freelancerId: key, name, pixKey: r.freelancer?.pixKey ?? null, count: 0, total: 0, lines: [] };
    const amount = Number(r.amount);
    g.lines.push({
      id: r.id,
      date: r.createdAt.toISOString().slice(0, 10),
      unit: r.unit.name,
      status: PAY_STATUS_LABEL[r.status] ?? r.status,
      amount,
      divergent: r.divergent,
      standardValue: r.standardValue != null ? Number(r.standardValue) : null,
    });
    g.count++;
    g.total += amount;
    grandTotal += amount;
    map.set(key, g);
  }

  const groups = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return { yearMonth, groups, grandTotal, grandCount: rows.length };
}
