import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUsers } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

type Ctx = { ip?: string | null; userAgent?: string | null };

/** O ESCRITÓRIO devolve: quem recompõe o cofre. O gerente que retirou não dá a própria baixa. */
export const PODE_DEVOLVER = new Set(['SUPERVISOR', 'COORDINATOR', 'FINANCE', 'ADMIN', 'CEO']);
export const podeDevolver = (role: string) => PODE_DEVOLVER.has(role);

export type RefundResult = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'NOT_FOUND' | 'STATE' };

/**
 * Registra a devolução do valor à unidade: PENDENTE → DEVOLVIDA.
 *
 * O lançamento original não é tocado (valor, descrição, comprovante, quem
 * lançou): a devolução ENTRA como quem/quando/quanto ao lado dele. O
 * `updateMany` com o status na condição fecha a dupla baixa simultânea.
 */
export async function registerRefund(user: SessionUser, id: string, ctx: Ctx = {}): Promise<RefundResult> {
  if (!podeDevolver(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const d = await prisma.cashExpense.findUnique({ where: { id }, select: { unitId: true, status: true, amount: true, createdById: true, description: true } });
  if (!d) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, d.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (d.status !== 'PENDING_REFUND') return { ok: false, reason: 'STATE' };

  const r = await prisma.cashExpense.updateMany({
    where: { id, status: 'PENDING_REFUND' },
    data: { status: 'REFUNDED', refundedAt: new Date(), refundedById: user.id, refundedByName: user.name, refundedAmount: d.amount },
  });
  if (r.count === 0) return { ok: false, reason: 'STATE' };

  await audit({ userId: user.id, unitId: d.unitId, action: 'EXPENSE_REFUND', module: 'EXPENSES', entity: 'cash_expense', entityId: id, metadata: { amount: Number(d.amount) }, ...ctx });
  if (d.createdById && d.createdById !== user.id) {
    await notifyUsers([d.createdById], {
      title: 'Devolução registrada',
      body: `R$ ${Number(d.amount).toFixed(2)} de "${d.description}" foi devolvido ao cofre da unidade por ${user.name}.`,
      link: '/modulos/despesas',
      module: 'EXPENSES',
    });
  }
  return { ok: true };
}
