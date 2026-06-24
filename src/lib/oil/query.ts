import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';

export async function listOilCollections(user: SessionUser, opts: { unitId?: string; limit?: number } = {}) {
  return prisma.oilCollection.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(opts.unitId ? { unitId: opts.unitId } : {}) },
    orderBy: [{ operationalDate: 'desc' }, { createdAt: 'desc' }],
    take: opts.limit ?? 150,
    include: { unit: { select: { name: true } }, supplier: { select: { name: true } }, createdBy: { select: { name: true } } },
  });
}

export interface OilGroup { key: string; name: string; liters: number; total: number }
export interface OilMonth { month: string; liters: number; total: number }
export interface OilDashboard {
  totalLiters: number;
  totalValue: number;
  avgPricePerLiter: number;
  byUnit: OilGroup[];
  byMethod: OilGroup[];
  monthly: OilMonth[];
}

const MONTHS_BACK = 6;

export async function getOilDashboard(user: SessionUser, opts: { unitId?: string } = {}): Promise<OilDashboard> {
  const d = new Date();
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (MONTHS_BACK - 1), 1));
  const startStr = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const rows = await prisma.oilCollection.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(opts.unitId ? { unitId: opts.unitId } : {}), operationalDate: { gte: startStr } },
    include: { unit: { select: { name: true } } },
  });

  let totalLiters = 0, totalValue = 0;
  const byUnit = new Map<string, OilGroup>();
  const byMethod = new Map<string, OilGroup>();
  const byMonth = new Map<string, OilMonth>();
  for (const r of rows) {
    const liters = Number(r.liters); const total = Number(r.totalValue);
    totalLiters += liters; totalValue += total;
    const u = byUnit.get(r.unitId) ?? { key: r.unitId, name: r.unit.name, liters: 0, total: 0 };
    u.liters += liters; u.total += total; byUnit.set(r.unitId, u);
    const mk = r.paymentMethod || 'Não informado';
    const me = byMethod.get(mk) ?? { key: mk, name: mk, liters: 0, total: 0 };
    me.liters += liters; me.total += total; byMethod.set(mk, me);
    const m = r.operationalDate.slice(0, 7);
    const mo = byMonth.get(m) ?? { month: m, liters: 0, total: 0 };
    mo.liters += liters; mo.total += total; byMonth.set(m, mo);
  }

  return {
    totalLiters,
    totalValue,
    avgPricePerLiter: totalLiters > 0 ? totalValue / totalLiters : 0,
    byUnit: [...byUnit.values()].sort((a, b) => b.total - a.total),
    byMethod: [...byMethod.values()].sort((a, b) => b.total - a.total),
    monthly: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}
