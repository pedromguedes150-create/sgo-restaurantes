import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import { getMetaRanking, type MetaRankingRow } from './query';
import { shortUnitName } from '@/lib/unit-name';

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export interface ConsolidadoStats {
  media: number;
  melhor: number;
  dentroDaMeta: number; // ≥80
  atencao: number; // 50-79
  criticas: number; // <50
}

/** Purely computes KPI stats from ranking data — no DB needed. */
export function calcularStats(ranking: MetaRankingRow[]): ConsolidadoStats {
  if (ranking.length === 0) return { media: 0, melhor: 0, dentroDaMeta: 0, atencao: 0, criticas: 0 };
  const media = Math.round(ranking.reduce((s, r) => s + r.scorePct, 0) / ranking.length);
  const melhor = Math.max(...ranking.map((r) => r.scorePct));
  const dentroDaMeta = ranking.filter((r) => r.scorePct >= 80).length;
  const atencao = ranking.filter((r) => r.scorePct >= 50 && r.scorePct < 80).length;
  const criticas = ranking.filter((r) => r.scorePct < 50).length;
  return { media, melhor, dentroDaMeta, atencao, criticas };
}

/** Status label for score (green/amber/red). */
export function zoneDaScore(scorePct: number): 'success' | 'warning' | 'danger' {
  return scorePct >= 80 ? 'success' : scorePct >= 50 ? 'warning' : 'danger';
}

export interface PiorMetaUnidade {
  unitId: string;
  name: string;
  scorePct: number;
}

export interface PiorMeta {
  name: string;
  scorePct: number;
  unidades: PiorMetaUnidade[];
}

/**
 * Top N worst task checklists across the network for a given month.
 * One DB query for all units — does not call getMetaBreakdown to avoid
 * calling it N times (same logic, scoped to the whole network at once).
 */
export async function getPioresMetas(user: SessionUser, yearMonth: string, top = 5): Promise<PiorMeta[]> {
  const unitWhere = unitScopeWhere(user, 'unitId');

  const instances = await prisma.taskInstance.findMany({
    where: {
      ...unitWhere,
      operationalDate: { startsWith: yearMonth },
      status: { in: ['DONE', 'MISSED'] },
      template: { entersMeta: true },
    },
    select: {
      status: true,
      unitId: true,
      unit: { select: { name: true } },
      template: { select: { name: true } },
    },
  });

  const byTask = new Map<
    string,
    { name: string; done: number; missed: number; byUnit: Map<string, { unitId: string; name: string; done: number; missed: number }> }
  >();

  for (const i of instances) {
    const taskName = i.template.name;
    if (!byTask.has(taskName)) byTask.set(taskName, { name: taskName, done: 0, missed: 0, byUnit: new Map() });
    const entry = byTask.get(taskName)!;
    if (i.status === 'DONE') entry.done++;
    else entry.missed++;

    if (!entry.byUnit.has(i.unitId)) {
      entry.byUnit.set(i.unitId, { unitId: i.unitId, name: shortUnitName(i.unit.name), done: 0, missed: 0 });
    }
    const u = entry.byUnit.get(i.unitId)!;
    if (i.status === 'DONE') u.done++;
    else u.missed++;
  }

  return [...byTask.values()]
    .map((t) => ({
      name: t.name,
      scorePct: t.done + t.missed === 0 ? 0 : Math.round((t.done / (t.done + t.missed)) * 100),
      unidades: [...t.byUnit.values()]
        .map((u) => ({
          unitId: u.unitId,
          name: u.name,
          scorePct: u.done + u.missed === 0 ? 0 : Math.round((u.done / (u.done + u.missed)) * 100),
        }))
        .sort((a, b) => a.scorePct - b.scorePct),
    }))
    .sort((a, b) => a.scorePct - b.scorePct)
    .slice(0, top);
}

export interface EvolucaoMes {
  month: string; // 'YYYY-MM'
  monthLabel: string; // 'Jan/24'
  scorePct: number;
}

/**
 * Monthly average score for the network, for the last `meses` months ending at `ateMonth`.
 * Reuses getMetaRanking (same calculation as the ranking page) — no divergence.
 */
export async function getEvolucaoDaRede(user: SessionUser, ateMonth: string, meses: 3 | 6 | 12): Promise<EvolucaoMes[]> {
  const [year, month] = ateMonth.split('-').map(Number);
  const months: string[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  const results = await Promise.all(
    months.map(async (m) => {
      const ranking = await getMetaRanking(user, m);
      const media = ranking.length === 0 ? 0 : Math.round(ranking.reduce((s, r) => s + r.scorePct, 0) / ranking.length);
      const [y, mo] = m.split('-').map(Number);
      return { month: m, monthLabel: `${MONTH_LABELS[mo - 1]}/${String(y).slice(2)}`, scorePct: media };
    }),
  );

  return results;
}

export interface ComparacaoUnidade {
  unitId: string;
  name: string;
  scorePct: number;
  breakdown: { name: string; scorePct: number; weight: number }[];
}

/** Breakdown for up to 3 units for side-by-side comparison. */
export async function getBreakdownComparacao(unitIds: string[], yearMonth: string): Promise<ComparacaoUnidade[]> {
  const [{ getMetaBreakdown }, { getUnitMonthScore }] = await Promise.all([import('./query'), import('@/lib/tasks/summary')]);
  const units = await prisma.unit.findMany({ where: { id: { in: unitIds }, active: true }, select: { id: true, name: true } });

  return Promise.all(
    units.map(async (u) => {
      const [score, breakdown] = await Promise.all([getUnitMonthScore(u.id, yearMonth), getMetaBreakdown(u.id, yearMonth)]);
      return {
        unitId: u.id,
        name: shortUnitName(u.name),
        scorePct: score.scorePct,
        breakdown: breakdown.map((r) => ({ name: r.name, scorePct: r.scorePct, weight: r.weight })),
      };
    }),
  );
}
