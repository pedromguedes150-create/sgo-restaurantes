import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { currentOperationalDate } from '@/lib/date/operational';
import type { SessionUser } from '@/lib/auth/session';
import {
  categoriaValida, DESCRICAO_MAX, ORIGEM_FIXA, valorValido, type CategoriaDespesa,
} from '@/lib/expenses/tipos';

type Ctx = { ip?: string | null; userAgent?: string | null };

export interface CreateExpenseInput {
  unitId: string;
  /** 'AAAA-MM-DD'; vazio = hoje (dia operacional da unidade). */
  expenseDate?: string | null;
  amount: number;
  category: string;
  description: string;
  receiptPath?: string | null;
}

export type CreateExpenseReason = 'FORBIDDEN' | 'INVALID' | 'SEM_DESCRICAO' | 'DATA_FUTURA' | 'CATEGORIA' | 'VALOR';
export type CreateExpenseResult = { ok: true; id: string } | { ok: false; reason: CreateExpenseReason };

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Quem lança: quem opera a unidade. Escopo por unidade SEMPRE no servidor. */
export const PODE_LANCAR = new Set(['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN', 'CEO']);

/**
 * Registra uma despesa paga com dinheiro do COFRE.
 *
 * Não há campo de origem no input, de propósito: `source` é gravado como
 * `SAFE` aqui, e só aqui. Unidade e responsável são conferidos/lidos da
 * SESSÃO — o corpo não escolhe outra unidade nem outro gerente. A despesa
 * nasce PENDENTE DE DEVOLUÇÃO: o escritório ainda precisa recompor o cofre.
 */
export async function createExpense(user: SessionUser, input: CreateExpenseInput, ctx: Ctx = {}): Promise<CreateExpenseResult> {
  if (!PODE_LANCAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.unitId || !canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { timezone: true, cutoffHour: true, active: true } });
  if (!unit || !unit.active) return { ok: false, reason: 'FORBIDDEN' };

  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!valorValido(amount)) return { ok: false, reason: 'VALOR' };
  if (!categoriaValida(input.category)) return { ok: false, reason: 'CATEGORIA' };
  const description = String(input.description ?? '').trim().slice(0, DESCRICAO_MAX);
  if (!description) return { ok: false, reason: 'SEM_DESCRICAO' };

  /* Retroativa sim (a compra de ontem lançada hoje é o caso comum); futura
     nunca — despesa que não aconteceu não saiu do cofre. */
  const hoje = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  const expenseDate = input.expenseDate?.trim() || hoje;
  if (!DIA.test(expenseDate)) return { ok: false, reason: 'INVALID' };
  if (expenseDate > hoje) return { ok: false, reason: 'DATA_FUTURA' };

  const rec = await prisma.cashExpense.create({
    data: {
      unitId: input.unitId,
      source: ORIGEM_FIXA,
      expenseDate,
      amount,
      category: input.category as CategoriaDespesa,
      description,
      receiptPath: input.receiptPath ?? null,
      createdById: user.id,
      createdByName: user.name,
    },
  });
  await audit({
    userId: user.id, unitId: input.unitId, action: 'EXPENSE_CREATE', module: 'EXPENSES', entity: 'cash_expense', entityId: rec.id,
    metadata: { amount, category: input.category, expenseDate, source: ORIGEM_FIXA, comprovante: Boolean(input.receiptPath) },
    ...ctx,
  });
  return { ok: true, id: rec.id };
}
