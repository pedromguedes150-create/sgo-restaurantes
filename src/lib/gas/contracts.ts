import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Contratos de gás (16/07): por UNIDADE+FORNECEDOR, com período, quantidade
 * (kg) e preço/kg acordados. Baixa automática: recebimentos lançados da
 * unidade+fornecedor dentro do período abatem a quantidade. initialUsedKg =
 * posição de contrato que já estava em andamento antes do SGO.
 */
type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function canManage(user: SessionUser): boolean {
  return user.role === 'SUPERVISOR' || user.role === 'ADMIN' || user.role === 'CEO';
}

export async function createGasContract(
  user: SessionUser,
  input: { unitId: string; supplierId: string; startDate: string; endDate: string; quantityKg: number; pricePerKg: number; initialUsedKg?: number; note?: string },
  ctx: Ctx = {},
): Promise<Result> {
  if (!canManage(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate) || input.endDate < input.startDate) return { ok: false, reason: 'INVALID' };
  if (!(input.quantityKg > 0) || !(input.pricePerKg > 0)) return { ok: false, reason: 'INVALID' };
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { name: true } });
  if (!supplier) return { ok: false, reason: 'NOT_FOUND' };

  const c = await prisma.gasContract.create({
    data: {
      unitId: input.unitId, supplierId: input.supplierId,
      startDate: input.startDate, endDate: input.endDate,
      quantityKg: input.quantityKg, pricePerKg: input.pricePerKg,
      initialUsedKg: Math.max(0, input.initialUsedKg ?? 0),
      note: input.note?.trim() || null,
      createdById: user.id, createdByName: user.name,
    },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'GAS_CONTRACT_CREATE', module: 'GAS', entity: 'gas_contract', entityId: c.id, metadata: { supplier: supplier.name, kg: input.quantityKg, price: input.pricePerKg }, ...ctx });
  return { ok: true, id: c.id };
}

export async function updateGasContract(
  user: SessionUser,
  id: string,
  input: { startDate?: string; endDate?: string; quantityKg?: number; pricePerKg?: number; initialUsedKg?: number; note?: string; active?: boolean },
  ctx: Ctx = {},
): Promise<Result> {
  if (!canManage(user)) return { ok: false, reason: 'FORBIDDEN' };
  const c = await prisma.gasContract.findUnique({ where: { id }, select: { unitId: true } });
  if (!c) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, c.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (input.startDate !== undefined && !DATE_RE.test(input.startDate)) return { ok: false, reason: 'INVALID' };
  if (input.endDate !== undefined && !DATE_RE.test(input.endDate)) return { ok: false, reason: 'INVALID' };

  await prisma.gasContract.update({
    where: { id },
    data: {
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.quantityKg !== undefined && input.quantityKg > 0 ? { quantityKg: input.quantityKg } : {}),
      ...(input.pricePerKg !== undefined && input.pricePerKg > 0 ? { pricePerKg: input.pricePerKg } : {}),
      ...(input.initialUsedKg !== undefined ? { initialUsedKg: Math.max(0, input.initialUsedKg) } : {}),
      ...(input.note !== undefined ? { note: input.note.trim() || null } : {}),
      ...(input.active !== undefined ? { active: Boolean(input.active) } : {}),
    },
  });
  await audit({ userId: user.id, unitId: c.unitId, action: 'GAS_CONTRACT_UPDATE', module: 'GAS', entity: 'gas_contract', entityId: id, metadata: { fields: Object.keys(input) }, ...ctx });
  return { ok: true };
}

export async function deleteGasContract(user: SessionUser, id: string, ctx: Ctx = {}): Promise<Result> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const c = await prisma.gasContract.findUnique({ where: { id }, select: { unitId: true } });
  if (!c) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.gasContract.delete({ where: { id } });
  await audit({ userId: user.id, unitId: c.unitId, action: 'GAS_CONTRACT_DELETE', module: 'GAS', entity: 'gas_contract', entityId: id, ...ctx });
  return { ok: true };
}

export interface GasContractRow {
  id: string; unitId: string; unitName: string; supplierId: string; supplierName: string;
  startDate: string; endDate: string; quantityKg: number; pricePerKg: number; initialUsedKg: number;
  purchasedKg: number; // recebimentos no período (SGO)
  usedKg: number; // initialUsedKg + purchasedKg
  progressPct: number; // usedKg ÷ quantityKg
  remainingKg: number;
  expired: boolean; active: boolean; note: string | null;
}

/** Contratos do escopo com a posição/baixa calculada dos recebimentos. */
export async function listGasContracts(user: SessionUser, opts: { activeOnly?: boolean } = {}): Promise<GasContractRow[]> {
  const contracts = await prisma.gasContract.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(opts.activeOnly ? { active: true } : {}) },
    orderBy: [{ active: 'desc' }, { endDate: 'asc' }],
  });
  if (contracts.length === 0) return [];
  const [units, suppliers] = await Promise.all([
    prisma.unit.findMany({ where: { id: { in: [...new Set(contracts.map((c) => c.unitId))] } }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ where: { id: { in: [...new Set(contracts.map((c) => c.supplierId))] } }, select: { id: true, name: true } }),
  ]);
  const unitBy = new Map(units.map((u) => [u.id, u.name]));
  const supBy = new Map(suppliers.map((s) => [s.id, s.name]));
  const today = new Date().toISOString().slice(0, 10);

  const out: GasContractRow[] = [];
  for (const c of contracts) {
    const agg = await prisma.gasReceipt.aggregate({
      where: { unitId: c.unitId, supplierId: c.supplierId, operationalDate: { gte: c.startDate, lte: c.endDate } },
      _sum: { quantityKg: true },
    });
    const purchasedKg = Number(agg._sum.quantityKg ?? 0);
    const usedKg = Number(c.initialUsedKg) + purchasedKg;
    const quantityKg = Number(c.quantityKg);
    out.push({
      id: c.id, unitId: c.unitId, unitName: unitBy.get(c.unitId) ?? '—',
      supplierId: c.supplierId, supplierName: supBy.get(c.supplierId) ?? '—',
      startDate: c.startDate, endDate: c.endDate,
      quantityKg, pricePerKg: Number(c.pricePerKg), initialUsedKg: Number(c.initialUsedKg),
      purchasedKg: Math.round(purchasedKg * 100) / 100,
      usedKg: Math.round(usedKg * 100) / 100,
      progressPct: quantityKg > 0 ? Math.min(999, Math.round((usedKg / quantityKg) * 100)) : 0,
      remainingKg: Math.round((quantityKg - usedKg) * 100) / 100,
      expired: c.endDate < today,
      active: c.active, note: c.note,
    });
  }
  return out;
}

/** Total comprado (kg e R$) dentro dos filtros do dashboard (unidade/fornecedor/mês). */
export async function getGasPurchasedInFilter(user: SessionUser, filters: { unitId?: string; supplierId?: string; yearMonth?: string }): Promise<{ kg: number; total: number; count: number }> {
  const agg = await prisma.gasReceipt.aggregate({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.yearMonth ? { operationalDate: { startsWith: filters.yearMonth } } : {}),
    },
    _sum: { quantityKg: true, totalValue: true },
    _count: true,
  });
  return {
    kg: Math.round(Number(agg._sum.quantityKg ?? 0) * 100) / 100,
    total: Math.round(Number(agg._sum.totalValue ?? 0) * 100) / 100,
    count: agg._count,
  };
}
