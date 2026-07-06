import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import type { CancellationStatus } from '@prisma/client';

export async function getReasons() {
  return prisma.cancellationReason.findMany({ where: { active: true }, orderBy: { order: 'asc' } });
}

export async function listCancellations(
  user: SessionUser,
  filters: { unitId?: string; status?: CancellationStatus } = {},
) {
  return prisma.cancellation.findMany({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: { unit: { select: { name: true, code: true } }, reason: { select: { name: true } }, justifiedBy: { select: { name: true } } },
  });
}

export interface CancellationSummary {
  pending: number;
  justified: number;
  total: number;
  justifiedPct: number;
  monthTotal: number; // do mês corrente
  byOperator: { operator: string; count: number }[];
}

/** Resumo do mês (Módulo 4): total, % justificados, ranking por operador de caixa. */
export async function getCancellationSummary(user: SessionUser, yearMonth: string): Promise<CancellationSummary> {
  const scope = unitScopeWhere(user, 'unitId');
  const rows = await prisma.cancellation.findMany({
    where: { ...scope, operationalDate: { startsWith: yearMonth } },
    select: { status: true, cashOperator: true },
  });

  const pending = rows.filter((r) => r.status === 'PENDING').length;
  const justified = rows.filter((r) => r.status === 'JUSTIFIED').length;
  const total = rows.length;

  const opMap = new Map<string, number>();
  for (const r of rows) {
    const op = r.cashOperator?.trim() || '—';
    opMap.set(op, (opMap.get(op) ?? 0) + 1);
  }
  const byOperator = [...opMap.entries()]
    .map(([operator, count]) => ({ operator, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    pending,
    justified,
    total,
    justifiedPct: total === 0 ? 0 : Math.round((justified / total) * 100),
    monthTotal: total,
    byOperator,
  };
}

/** Nº de cancelamentos pendentes no escopo (dashboard). */
export async function getPendingCancellationCount(user: SessionUser): Promise<number> {
  return prisma.cancellation.count({ where: { ...unitScopeWhere(user, 'unitId'), status: 'PENDING' } });
}

export interface CancellationExportRow {
  operationalDate: string;
  unit: string;
  coupon: string;
  operator: string;
  value: number;
  status: string;
  reason: string;
  justifiedBy: string;
  justifiedAt: string;
  note: string;
}

/** Linhas detalhadas do mês (relatório/export). Respeita escopo e filtro opcional de unidade. */
export async function getCancellationsForExport(
  user: SessionUser,
  yearMonth: string,
  unitId?: string,
): Promise<CancellationExportRow[]> {
  const rows = await prisma.cancellation.findMany({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      ...(unitId ? { unitId } : {}),
      operationalDate: { startsWith: yearMonth },
    },
    orderBy: [{ operationalDate: 'asc' }, { createdAt: 'asc' }],
    include: { unit: { select: { name: true } }, reason: { select: { name: true } }, justifiedBy: { select: { name: true } } },
  });
  return rows.map((c) => ({
    operationalDate: c.operationalDate,
    unit: c.unit.name,
    coupon: c.couponNumber,
    operator: c.cashOperator?.trim() || '—',
    value: Number(c.value),
    status: c.status === 'JUSTIFIED' ? 'Justificado' : 'Pendente',
    reason: c.reason?.name ?? '',
    justifiedBy: c.justifiedBy?.name ?? '',
    justifiedAt: c.justifiedAt ? new Date(c.justifiedAt).toLocaleString('pt-BR') : '',
    note: c.justificationNote ?? '',
  }));
}
