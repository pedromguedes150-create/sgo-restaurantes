import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { PayoutType } from '@prisma/client';

/**
 * Comissões/Mobilidade (item 14, Onda 3): Supervisor/Admin lança valores
 * (comissão do Teknisa / mobilidade manual) por colaborador/unidade/mês.
 * Vários lançamentos por mês são permitidos (ajustes) — dashboards somam.
 */
type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

const CAN_CREATE = new Set(['ADMIN', 'SUPERVISOR', 'CEO']);

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function createPayout(
  user: SessionUser,
  input: { collaboratorId: string; type: PayoutType; yearMonth: string; amount: number; note?: string },
  ctx: Ctx = {},
): Promise<Result> {
  if (!CAN_CREATE.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  if (input.type !== 'COMMISSION' && input.type !== 'MOBILITY') return { ok: false, reason: 'INVALID' };
  if (!/^\d{4}-\d{2}$/.test(input.yearMonth) || input.yearMonth > currentYearMonth()) return { ok: false, reason: 'INVALID' };
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999) return { ok: false, reason: 'INVALID' };

  const collab = await prisma.collaborator.findUnique({
    where: { id: input.collaboratorId },
    select: { name: true, units: { select: { unitId: true } } },
  });
  if (!collab) return { ok: false, reason: 'NOT_FOUND' };
  const unitId = collab.units.find((u) => canAccessUnit(user, u.unitId))?.unitId;
  if (!unitId) return { ok: false, reason: 'FORBIDDEN' };

  const p = await prisma.collaboratorPayout.create({
    data: {
      collaboratorId: input.collaboratorId, collaboratorName: collab.name, unitId,
      type: input.type, yearMonth: input.yearMonth, amount, note: input.note?.trim() || null,
      createdById: user.id, createdByName: user.name,
    },
  });
  await audit({
    userId: user.id, unitId, action: `PAYOUT_${input.type}`, module: 'PEOPLE', entity: 'collaborator_payout',
    entityId: p.id, metadata: { name: collab.name, yearMonth: input.yearMonth, amount }, ...ctx,
  });
  return { ok: true, id: p.id };
}

export interface PayoutRow {
  id: string; collaboratorName: string; unitName: string; type: PayoutType;
  yearMonth: string; amount: number; note: string | null; createdByName: string; createdAt: string;
}

/** Histórico do mês (escopo do usuário), mais recentes primeiro. */
export async function listPayouts(user: SessionUser, yearMonth: string): Promise<PayoutRow[]> {
  const rows = await prisma.collaboratorPayout.findMany({
    where: { yearMonth, ...unitScopeWhere(user, 'unitId') },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const unitIds = [...new Set(rows.map((r) => r.unitId))];
  const units = await prisma.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true } });
  const unitBy = new Map(units.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id, collaboratorName: r.collaboratorName, unitName: unitBy.get(r.unitId) ?? '—', type: r.type,
    yearMonth: r.yearMonth, amount: Number(r.amount), note: r.note, createdByName: r.createdByName,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface PayoutDashboard {
  totalCommission: number;
  totalMobility: number;
  byUnit: { unitName: string; commission: number; mobility: number }[];
  topCollaborators: { name: string; total: number }[];
  trend: { yearMonth: string; commission: number; mobility: number }[]; // últimos 12 meses
}

/** Dashboard do mês + tendência 12m (escopo do usuário). */
export async function getPayoutDashboard(user: SessionUser, yearMonth: string): Promise<PayoutDashboard> {
  const [y, m] = yearMonth.split('-').map(Number);
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const rows = await prisma.collaboratorPayout.findMany({
    where: { yearMonth: { in: months }, ...unitScopeWhere(user, 'unitId') },
    select: { unitId: true, collaboratorName: true, type: true, yearMonth: true, amount: true },
  });
  const units = await prisma.unit.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.unitId))] } }, select: { id: true, name: true } });
  const unitBy = new Map(units.map((u) => [u.id, u.name]));

  const monthRows = rows.filter((r) => r.yearMonth === yearMonth);
  const sum = (list: typeof rows, t: PayoutType) => list.filter((r) => r.type === t).reduce((s, r) => s + Number(r.amount), 0);

  const byUnitMap = new Map<string, { commission: number; mobility: number }>();
  for (const r of monthRows) {
    const key = unitBy.get(r.unitId) ?? '—';
    const cur = byUnitMap.get(key) ?? { commission: 0, mobility: 0 };
    if (r.type === 'COMMISSION') cur.commission += Number(r.amount); else cur.mobility += Number(r.amount);
    byUnitMap.set(key, cur);
  }
  const byCollab = new Map<string, number>();
  for (const r of monthRows) byCollab.set(r.collaboratorName, (byCollab.get(r.collaboratorName) ?? 0) + Number(r.amount));

  return {
    totalCommission: sum(monthRows, 'COMMISSION'),
    totalMobility: sum(monthRows, 'MOBILITY'),
    byUnit: [...byUnitMap.entries()].map(([unitName, v]) => ({ unitName, ...v })).sort((a, b) => (b.commission + b.mobility) - (a.commission + a.mobility)),
    topCollaborators: [...byCollab.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 10),
    trend: months.map((ym) => {
      const list = rows.filter((r) => r.yearMonth === ym);
      return { yearMonth: ym, commission: sum(list, 'COMMISSION'), mobility: sum(list, 'MOBILITY') };
    }),
  };
}

/** Colaboradores ativos no escopo (para o seletor de lançamento). */
export async function listPayoutCollaborators(user: SessionUser) {
  return prisma.collaborator.findMany({
    where: { active: true, units: { some: { ...unitScopeWhere(user, 'unitId') } } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, jobTitle: true, units: { select: { unit: { select: { name: true } } } } },
    take: 500,
  });
}
