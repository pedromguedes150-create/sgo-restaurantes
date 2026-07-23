import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

const ALERT_KEY = 'GAS_ALERT_PCT';
const DEFAULT_ALERT = 10;

export async function getGasAlertPct(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: ALERT_KEY } });
  const n = s ? Number(s.value) : DEFAULT_ALERT;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ALERT;
}
export async function setGasAlertPct(user: SessionUser, pct: number) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  const p = Math.max(1, Math.round(pct));
  await prisma.appSetting.upsert({ where: { key: ALERT_KEY }, create: { key: ALERT_KEY, value: String(p) }, update: { value: String(p) } });
  await audit({ userId: user.id, action: 'GAS_ALERT_PCT_SET', module: 'CONFIG', metadata: { pct: p } });
  return { ok: true as const };
}

export async function listGasReceipts(user: SessionUser, opts: { unitId?: string; limit?: number } = {}) {
  return prisma.gasReceipt.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(opts.unitId ? { unitId: opts.unitId } : {}) },
    orderBy: [{ operationalDate: 'desc' }, { createdAt: 'desc' }],
    take: opts.limit ?? 100,
    include: { unit: { select: { name: true, code: true } }, supplier: { select: { name: true } }, createdBy: { select: { name: true } } },
  });
}

export interface GasVarRow { date: string; supplier: string; price: number; prevPrice: number | null; variationPct: number | null; alerted: boolean }
export interface GasVarUnit { unitId: string; unit: string; rows: GasVarRow[]; first: number | null; last: number | null; min: number; max: number; avg: number }

/** Relatório de variação do preço/kg por unidade (linha do tempo dos recebimentos). */
export async function getGasVariationReport(user: SessionUser, opts: { unitId?: string; months?: number } = {}): Promise<GasVarUnit[]> {
  const months = opts.months ?? 12;
  const d = new Date();
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (months - 1), 1));
  const startStr = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const receipts = await prisma.gasReceipt.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(opts.unitId ? { unitId: opts.unitId } : {}), operationalDate: { gte: startStr } },
    orderBy: [{ unitId: 'asc' }, { operationalDate: 'asc' }, { createdAt: 'asc' }],
    include: { unit: { select: { name: true } }, supplier: { select: { name: true } } },
  });

  const byUnit = new Map<string, GasVarUnit>();
  for (const r of receipts) {
    const g = byUnit.get(r.unitId) ?? { unitId: r.unitId, unit: r.unit.name, rows: [], first: null, last: null, min: Infinity, max: 0, avg: 0 };
    const price = Number(r.pricePerKg);
    g.rows.push({ date: r.operationalDate, supplier: r.supplier?.name ?? 'Sem fornecedor', price, prevPrice: r.prevPricePerKg != null ? Number(r.prevPricePerKg) : null, variationPct: r.variationPct, alerted: r.alerted });
    byUnit.set(r.unitId, g);
  }
  for (const g of byUnit.values()) {
    const prices = g.rows.map((x) => x.price);
    g.first = prices[0] ?? null; g.last = prices[prices.length - 1] ?? null;
    g.min = Math.min(...prices); g.max = Math.max(...prices);
    g.avg = prices.reduce((s, p) => s + p, 0) / prices.length;
  }
  return [...byUnit.values()].sort((a, b) => a.unit.localeCompare(b.unit, 'pt-BR'));
}

export interface GasGroupStat { key: string; name: string; count: number; avg: number; last: number; min: number; max: number; kg: number; total: number }
export interface GasMonthPoint { month: string; avg: number; count: number }
export interface GasDashboard {
  totalReceipts: number;
  avgPrice: number;
  lastPrice: number | null;
  totalKg: number; // volume comprado no filtro
  totalValue: number; // valor comprado no filtro
  byUnit: GasGroupStat[];
  bySupplier: GasGroupStat[];
  monthly: GasMonthPoint[];
  alertPct: number;
}

type AggRow = { key: string; name: string; price: number; date: string; kg: number; total: number };
function agg(rows: AggRow[]): GasGroupStat[] {
  const map = new Map<string, { name: string; prices: number[]; lastDate: string; last: number; kg: number; total: number }>();
  for (const r of rows) {
    const cur = map.get(r.key) ?? { name: r.name, prices: [], lastDate: '', last: 0, kg: 0, total: 0 };
    cur.prices.push(r.price);
    cur.kg += r.kg; cur.total += r.total;
    if (r.date >= cur.lastDate) { cur.lastDate = r.date; cur.last = r.price; }
    map.set(r.key, cur);
  }
  return [...map.entries()].map(([key, v]) => ({
    key, name: v.name, count: v.prices.length,
    avg: v.prices.reduce((s, p) => s + p, 0) / v.prices.length,
    last: v.last, min: Math.min(...v.prices), max: Math.max(...v.prices),
    kg: Math.round(v.kg * 100) / 100, total: Math.round(v.total * 100) / 100,
  })).sort((a, b) => a.avg - b.avg);
}

/**
 * Painel de gás: comparativo por unidade, por fornecedor e tendência mensal.
 * Respeita os filtros de unidade, fornecedor e MÊS específico (yearMonth). Sem
 * mês, usa a janela dos últimos `months` meses. Também soma o VOLUME (kg) comprado.
 */
export async function getGasDashboard(user: SessionUser, opts: { unitId?: string; supplierId?: string; yearMonth?: string; months?: number } = {}): Promise<GasDashboard> {
  let dateFilter: Record<string, string> = {};
  if (opts.yearMonth && /^\d{4}-\d{2}$/.test(opts.yearMonth)) {
    // mês específico [primeiro dia, primeiro dia do mês seguinte)
    const [y, m] = opts.yearMonth.split('-').map(Number);
    const next = new Date(Date.UTC(y, m, 1));
    const nextStr = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
    dateFilter = { gte: `${opts.yearMonth}-01`, lt: nextStr };
  } else {
    const months = opts.months ?? 6;
    const d = new Date();
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (months - 1), 1));
    dateFilter = { gte: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-01` };
  }

  const receipts = await prisma.gasReceipt.findMany({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      ...(opts.unitId ? { unitId: opts.unitId } : {}),
      ...(opts.supplierId ? { supplierId: opts.supplierId } : {}),
      operationalDate: dateFilter,
    },
    orderBy: [{ operationalDate: 'asc' }],
    include: { unit: { select: { name: true } }, supplier: { select: { name: true } } },
  });

  const all = receipts.map((r) => ({ price: Number(r.pricePerKg), date: r.operationalDate, kg: Number(r.quantityKg), total: Number(r.totalValue), unitId: r.unitId, unitName: r.unit.name, supplierId: r.supplierId, supplierName: r.supplier?.name ?? 'Sem fornecedor' }));

  const byUnit = agg(all.map((r) => ({ key: r.unitId, name: r.unitName, price: r.price, date: r.date, kg: r.kg, total: r.total })));
  const bySupplier = agg(all.map((r) => ({ key: r.supplierId ?? 'none', name: r.supplierName, price: r.price, date: r.date, kg: r.kg, total: r.total })));

  // tendência mensal (média do preço/kg no escopo)
  const byMonth = new Map<string, number[]>();
  for (const r of all) { const m = r.date.slice(0, 7); const arr = byMonth.get(m) ?? []; arr.push(r.price); byMonth.set(m, arr); }
  const monthly: GasMonthPoint[] = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, ps]) => ({ month, avg: ps.reduce((s, p) => s + p, 0) / ps.length, count: ps.length }));

  const avgPrice = all.length ? all.reduce((s, r) => s + r.price, 0) / all.length : 0;
  const last = all.length ? all.reduce((a, b) => (b.date >= a.date ? b : a)) : null;
  const alertPct = await getGasAlertPct();

  return {
    totalReceipts: all.length, avgPrice, lastPrice: last ? last.price : null,
    totalKg: Math.round(all.reduce((s, r) => s + r.kg, 0) * 100) / 100,
    totalValue: Math.round(all.reduce((s, r) => s + r.total, 0) * 100) / 100,
    byUnit, bySupplier, monthly, alertPct,
  };
}
