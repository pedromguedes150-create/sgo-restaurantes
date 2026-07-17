import { prisma } from '@/lib/db/prisma';
import { currentOperationalDate } from '@/lib/date/operational';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { subDays, format } from 'date-fns';
import type { SessionUser } from '@/lib/auth/session';

export interface WasteCategoryDTO {
  id: string;
  code: string;
  name: string;
  measure: string;
}

export async function getActiveCategories(): Promise<WasteCategoryDTO[]> {
  const cats = await prisma.wasteCategory.findMany({
    where: { active: true },
    orderBy: { order: 'asc' },
    select: { id: true, code: true, name: true, measure: true },
  });
  return cats;
}

/** Lançamento de um dia (mapa categoria→kg) + metadados. */
export async function getEntryForDay(unitId: string, operationalDate: string) {
  const entry = await prisma.wasteEntry.findUnique({
    where: { unitId_operationalDate: { unitId, operationalDate } },
    include: { items: true, createdBy: { select: { name: true } } },
  });
  if (!entry) return null;
  const kgByCategory: Record<string, number> = {};
  let total = 0;
  for (const it of entry.items) {
    const v = Number(it.kg);
    kgByCategory[it.categoryId] = v;
    total += v;
  }
  return {
    id: entry.id,
    operationalDate,
    observation: entry.observation,
    createdBy: entry.createdBy?.name ?? null,
    evidencePath: entry.evidencePath,
    kgByCategory,
    total,
  };
}

export interface WasteSeries {
  days: { operationalDate: string; total: number }[];
  byCategory: { categoryId: string; name: string; total: number }[];
  daysWithRecord: number;
  windowDays: number;
  recordRatePct: number; // % de dias de operação com registro
  grandTotal: number;
}

/** Série dos últimos N dias operacionais para a unidade (barras + % registro). */
export async function getWasteSeries(
  unitId: string,
  windowDays = 30,
  now: Date = new Date(),
): Promise<WasteSeries> {
  const unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitId } });
  const today = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour }, now);

  const dates: string[] = [];
  const base = new Date(`${today}T12:00:00`);
  for (let d = 0; d < windowDays; d++) dates.push(format(subDays(base, d), 'yyyy-MM-dd'));

  const entries = await prisma.wasteEntry.findMany({
    where: { unitId, operationalDate: { in: dates } },
    include: { items: { include: { category: { select: { name: true } } } } },
  });

  const totalByDate = new Map<string, number>();
  const byCat = new Map<string, { name: string; total: number }>();
  let grandTotal = 0;
  for (const e of entries) {
    let dayTotal = 0;
    for (const it of e.items) {
      const v = Number(it.kg);
      dayTotal += v;
      grandTotal += v;
      const c = byCat.get(it.categoryId) ?? { name: it.category.name, total: 0 };
      c.total += v;
      byCat.set(it.categoryId, c);
    }
    totalByDate.set(e.operationalDate, dayTotal);
  }

  const days = dates
    .slice()
    .reverse()
    .map((operationalDate) => ({
      operationalDate,
      total: Math.round((totalByDate.get(operationalDate) ?? 0) * 100) / 100,
    }));

  const daysWithRecord = entries.length;
  return {
    days,
    byCategory: [...byCat.entries()].map(([categoryId, v]) => ({ categoryId, name: v.name, total: Math.round(v.total * 100) / 100 })),
    daysWithRecord,
    windowDays,
    recordRatePct: Math.round((daysWithRecord / windowDays) * 100),
    grandTotal: Math.round(grandTotal * 100) / 100,
  };
}

/** Comparativo entre unidades (Admin/CEO/Supervisor) — total de KG em N dias. */
export async function getCrossUnitWaste(user: SessionUser, windowDays = 30, now: Date = new Date()) {
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
  });
  const out: { unitId: string; name: string; total: number; recordRatePct: number }[] = [];
  for (const u of units) {
    const s = await getWasteSeries(u.id, windowDays, now);
    out.push({ unitId: u.id, name: u.name, total: s.grandTotal, recordRatePct: s.recordRatePct });
  }
  return out.sort((a, b) => b.total - a.total);
}
