import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';
import { categoriaValida, statusValido, totais, type CategoriaDespesa, type StatusDespesa } from '@/lib/expenses/tipos';

export interface FiltroDespesas {
  /** Unidades a mostrar (já no alcance); vazio = todas do escopo. */
  unitIds?: string[];
  /** 'AAAA-MM-DD' inclusivos. */
  de?: string;
  ate?: string;
  categoria?: string;
  status?: string;
}

export interface DespesaRow {
  id: string;
  unitId: string;
  unidade: string;
  expenseDate: string;
  amount: number;
  category: CategoriaDespesa;
  description: string;
  receiptPath: string | null;
  status: StatusDespesa;
  createdByName: string;
  createdAt: Date;
  refundedAt: Date | null;
  refundedByName: string | null;
  refundedAmount: number | null;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * O filtro da tela E o escopo de quem pergunta, em `AND`: um id de unidade
 * fora do alcance na URL não abre nada (lição da v1.130.0, em que o filtro
 * da URL vencia o escopo por escreverem a mesma chave).
 */
function where(user: SessionUser, f: FiltroDespesas): Prisma.CashExpenseWhereInput {
  return {
    AND: [
      unitScopeWhere(user, 'unitId'),
      {
        ...(f.unitIds?.length ? { unitId: { in: f.unitIds } } : {}),
        ...(f.de && DIA.test(f.de) ? { expenseDate: { gte: f.de } } : {}),
        ...(f.ate && DIA.test(f.ate) ? { expenseDate: { lte: f.ate } } : {}),
        ...(categoriaValida(f.categoria) ? { category: f.categoria } : {}),
        ...(statusValido(f.status) ? { status: f.status } : {}),
      },
    ],
  };
}

type Row = Prisma.CashExpenseGetPayload<{ include: { unit: { select: { name: true } } } }>;
const paraLinha = (r: Row): DespesaRow => ({
  id: r.id,
  unitId: r.unitId,
  unidade: r.unit.name,
  expenseDate: r.expenseDate,
  amount: Number(r.amount),
  category: r.category,
  description: r.description,
  receiptPath: r.receiptPath,
  status: r.status,
  createdByName: r.createdByName,
  createdAt: r.createdAt,
  refundedAt: r.refundedAt,
  refundedByName: r.refundedByName,
  refundedAmount: r.refundedAmount != null ? Number(r.refundedAmount) : null,
});

export const LIMITE_DA_LISTA = 500;

export async function listExpenses(user: SessionUser, f: FiltroDespesas = {}): Promise<DespesaRow[]> {
  const rows = await prisma.cashExpense.findMany({
    where: where(user, f),
    include: { unit: { select: { name: true } } },
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    take: LIMITE_DA_LISTA,
  });
  return rows.map(paraLinha);
}

/** Os cartões: total (o que saiu do cofre), pendente (falta recompor), devolvido. */
export async function getExpenseSummary(user: SessionUser, f: FiltroDespesas = {}) {
  const rows = await prisma.cashExpense.findMany({ where: where(user, f), select: { amount: true, status: true } });
  return totais(rows.map((r) => ({ amount: Number(r.amount), status: r.status })));
}

/** Uma despesa, se estiver no alcance. */
export async function getExpense(user: SessionUser, id: string): Promise<DespesaRow | null> {
  const r = await prisma.cashExpense.findFirst({ where: { id, ...unitScopeWhere(user, 'unitId') }, include: { unit: { select: { name: true } } } });
  return r ? paraLinha(r) : null;
}
