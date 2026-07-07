import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getUnitMonthScore } from '@/lib/tasks/summary';
import { getUsageBoard } from '@/lib/supervisor/usage';
import { getCashDashboard } from '@/lib/cash';
import { getCertificatesReport } from '@/lib/certificates/query';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Visão Executiva (sugestão 7 da análise de 08/07): "minha rede em 60 segundos".
 * Composição mensal por unidade a partir do que os módulos já calculam:
 * meta, uso do sistema, absenteísmo, desperdício, divergências de troco,
 * custo de manutenção e ocorrências graves. Restrito a CEO/Admin.
 */

export interface ExecutiveUnitRow {
  unitId: string;
  unitName: string;
  metaPct: number;
  usagePct: number;
  usageTone: 'success' | 'medium' | 'critical';
  wasteKg: number;
  absenteeismPct: number;
  certDays: number;
  cashDivergent: number;
  cashDivergenceTotal: number;
  maintenanceCost: number;
  maintenanceOpen: number;
  severeOccurrences: number; // gravidade alta/crítica no mês
  visitsDone: number;
}

export interface ExecutiveOverview {
  yearMonth: string;
  rows: ExecutiveUnitRow[];
  totals: {
    metaAvg: number; usageAvg: number; wasteKg: number; certDays: number;
    cashDivergent: number; cashDivergenceTotal: number; maintenanceCost: number; severeOccurrences: number; visitsDone: number;
  };
}

export async function getExecutiveOverview(user: SessionUser, yearMonth: string): Promise<ExecutiveOverview> {
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  const ids = units.map((u) => u.id);

  const [usage, cash, certs, wasteItems, tickets, occurrences, visits] = await Promise.all([
    getUsageBoard(user, yearMonth),
    getCashDashboard(user, yearMonth),
    getCertificatesReport(user, yearMonth),
    prisma.wasteEntryItem.findMany({
      where: { entry: { unitId: { in: ids }, operationalDate: { startsWith: yearMonth } } },
      select: { kg: true, entry: { select: { unitId: true } } },
    }),
    prisma.maintenanceTicket.findMany({
      where: { unitId: { in: ids }, createdAt: gteMonth(yearMonth), status: { not: 'CANCELED' } },
      select: { unitId: true, cost: true, status: true },
    }),
    prisma.occurrence.groupBy({
      by: ['unitId'],
      where: { unitId: { in: ids }, operationalDate: { startsWith: yearMonth }, gravity: { in: ['HIGH', 'CRITICAL'] } },
      _count: true,
    }),
    prisma.supervisorVisit.groupBy({
      by: ['unitId'],
      where: { unitId: { in: ids }, scheduledDate: { startsWith: yearMonth }, status: 'DONE' },
      _count: true,
    }),
  ]);

  const usageBy = new Map(usage.map((u) => [u.unitId, u]));
  const cashBy = new Map(cash.map((c) => [c.unitId, c]));
  const certBy = new Map(certs.byUnit.map((c) => [c.unitId, c]));
  const occBy = new Map(occurrences.map((o) => [o.unitId, o._count]));
  const visitBy = new Map(visits.map((v) => [v.unitId, v._count]));

  const wasteBy = new Map<string, number>();
  for (const w of wasteItems) {
    const uid = w.entry.unitId;
    wasteBy.set(uid, (wasteBy.get(uid) ?? 0) + Number(w.kg));
  }
  const maintBy = new Map<string, { cost: number; open: number }>();
  for (const t of tickets) {
    const cur = maintBy.get(t.unitId) ?? { cost: 0, open: 0 };
    cur.cost += t.cost != null ? Number(t.cost) : 0;
    if (t.status === 'OPEN' || t.status === 'IN_PROGRESS') cur.open += 1;
    maintBy.set(t.unitId, cur);
  }

  const rows: ExecutiveUnitRow[] = [];
  for (const u of units) {
    const us = usageBy.get(u.id);
    const meta = us ? us.metaPct : (await getUnitMonthScore(u.id, yearMonth)).scorePct;
    const c = cashBy.get(u.id);
    const cert = certBy.get(u.id);
    const m = maintBy.get(u.id);
    rows.push({
      unitId: u.id, unitName: u.name,
      metaPct: meta,
      usagePct: us?.usagePct ?? 0,
      usageTone: us?.tone ?? 'critical',
      wasteKg: Math.round((wasteBy.get(u.id) ?? 0) * 10) / 10,
      absenteeismPct: cert?.absenteeismPct ?? 0,
      certDays: cert?.days ?? 0,
      cashDivergent: c?.divergent ?? 0,
      cashDivergenceTotal: c?.divergenceTotal ?? 0,
      maintenanceCost: Math.round((m?.cost ?? 0) * 100) / 100,
      maintenanceOpen: m?.open ?? 0,
      severeOccurrences: occBy.get(u.id) ?? 0,
      visitsDone: visitBy.get(u.id) ?? 0,
    });
  }
  rows.sort((a, b) => b.metaPct - a.metaPct);

  const n = Math.max(1, rows.length);
  return {
    yearMonth,
    rows,
    totals: {
      metaAvg: Math.round(rows.reduce((s, r) => s + r.metaPct, 0) / n),
      usageAvg: Math.round(rows.reduce((s, r) => s + r.usagePct, 0) / n),
      wasteKg: Math.round(rows.reduce((s, r) => s + r.wasteKg, 0) * 10) / 10,
      certDays: rows.reduce((s, r) => s + r.certDays, 0),
      cashDivergent: rows.reduce((s, r) => s + r.cashDivergent, 0),
      cashDivergenceTotal: Math.round(rows.reduce((s, r) => s + r.cashDivergenceTotal, 0) * 100) / 100,
      maintenanceCost: Math.round(rows.reduce((s, r) => s + r.maintenanceCost, 0) * 100) / 100,
      severeOccurrences: rows.reduce((s, r) => s + r.severeOccurrences, 0),
      visitsDone: rows.reduce((s, r) => s + r.visitsDone, 0),
    },
  };
}

function gteMonth(yearMonth: string): { gte: Date; lt: Date } {
  const [y, m] = yearMonth.split('-').map(Number);
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
}
