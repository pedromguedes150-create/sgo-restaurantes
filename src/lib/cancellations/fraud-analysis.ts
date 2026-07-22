import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

/* Parser do PDF "Vendas/Itens Cancelados no Período" (Teknisa). Formato rotulado. */
export interface CancelRecord { comanda: string; dt: string | null; cupom: string | null; caixa: string | null; operador: string | null; supervisor: string | null; produto: string | null; value: number }

function money(s: string): number { const m = /(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/.exec(s || ''); return m ? parseFloat(m[0].replace(/\./g, '').replace(',', '.')) : 0; }
const isEntity = (s: string) => /^\d{6,}\s*-\s*\S/.test(s || '');

export async function parseCancellationPdf(buffer: Buffer): Promise<{ records: CancelRecord[]; filial: string | null; period: string | null }> {
  const pdf = (await import('pdf-parse/lib/pdf-parse.js')).default as (b: Buffer) => Promise<{ text: string }>;
  const parsed = await pdf(buffer);
  const L = parsed.text.split('\n').map((s) => s.trim()).filter(Boolean);
  const records: CancelRecord[] = [];
  let cur: CancelRecord | null = null;
  let filial: string | null = null, period: string | null = null;
  const flush = () => { if (cur && cur.comanda) records.push(cur); };
  for (let i = 0; i < L.length; i++) {
    const l = L[i], nx = L[i + 1] ?? '';
    if (l === 'FILIAL' && !filial) filial = nx;
    else if (l === 'PERÍODO' && !period) period = nx;
    else if (l === 'MESA/COMANDA') { flush(); cur = { comanda: nx, dt: null, cupom: null, caixa: null, operador: null, supervisor: null, produto: null, value: 0 }; }
    else if (!cur) continue;
    else if (l === 'DATA VENDA') cur.dt = nx;
    else if (l === 'CUPOM/NOTA FISCAL') cur.cupom = nx;
    else if (l === 'CAIXA') cur.caixa = nx;
    else if (l === 'OPERADOR') cur.operador = isEntity(nx) ? nx : null;
    else if (l === 'SUPERVISOR') { if (isEntity(nx)) cur.supervisor = nx; }
    else if (/^\d+\.\d+\.\d+\.\d+\.\d+/.test(l)) cur.produto = (cur.produto ? cur.produto + '; ' : '') + l.replace(/^[\d.]+/, '');
    else if (/^TOTAL VENDA/.test(l)) cur.value = money(l);
  }
  flush();
  return { records, filial, period };
}

/* ───────── Análise antifraude ───────── */
export interface CancelGroup { name: string; count: number; value: number; pct: number; avg: number }
export interface CancelFlag { level: 'high' | 'medium'; text: string }
export interface CancelAnalysisData {
  byCaixa: CancelGroup[]; bySupervisor: CancelGroup[]; byOperador: CancelGroup[];
  byHour: { hour: number; count: number; value: number }[];
  byDay: { date: string; count: number; value: number }[];
  topValue: { comanda: string; dt: string | null; caixa: string | null; supervisor: string | null; value: number; produto: string | null }[];
  flags: CancelFlag[];
  highValueCount: number; maxValue: number;
}

function group(records: CancelRecord[], key: keyof CancelRecord, totalValue: number): CancelGroup[] {
  const m = new Map<string, { count: number; value: number }>();
  for (const r of records) {
    const v = (r[key] as string) || '—';
    const g = m.get(v) ?? { count: 0, value: 0 };
    g.count++; g.value += r.value; m.set(v, g);
  }
  return [...m.entries()].map(([name, g]) => ({ name, count: g.count, value: Math.round(g.value * 100) / 100, pct: totalValue > 0 ? Math.round((g.value / totalValue) * 100) : 0, avg: g.count > 0 ? Math.round((g.value / g.count) * 100) / 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function analyzeCancellations(records: CancelRecord[]): { totalCount: number; totalValue: number; data: CancelAnalysisData } {
  const totalValue = Math.round(records.reduce((s, r) => s + r.value, 0) * 100) / 100;
  const byCaixa = group(records, 'caixa', totalValue);
  const bySupervisor = group(records.filter((r) => r.supervisor), 'supervisor', totalValue);
  const byOperador = group(records.filter((r) => r.operador), 'operador', totalValue);

  const hourMap = new Map<number, { count: number; value: number }>();
  const dayMap = new Map<string, { count: number; value: number }>();
  for (const r of records) {
    const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):/.exec(r.dt ?? '');
    if (m) {
      const h = Number(m[4]); const g = hourMap.get(h) ?? { count: 0, value: 0 }; g.count++; g.value += r.value; hourMap.set(h, g);
      const day = `${m[1]}/${m[2]}`; const dg = dayMap.get(day) ?? { count: 0, value: 0 }; dg.count++; dg.value += r.value; dayMap.set(day, dg);
    }
  }
  const byHour = [...hourMap.entries()].map(([hour, g]) => ({ hour, count: g.count, value: Math.round(g.value * 100) / 100 })).sort((a, b) => a.hour - b.hour);
  const byDay = [...dayMap.entries()].map(([date, g]) => ({ date, count: g.count, value: Math.round(g.value * 100) / 100 })).sort((a, b) => b.value - a.value);

  const HIGH = 100;
  const highValueCount = records.filter((r) => r.value >= HIGH).length;
  const maxValue = records.reduce((mx, r) => Math.max(mx, r.value), 0);
  const topValue = records.slice().sort((a, b) => b.value - a.value).slice(0, 20).map((r) => ({ comanda: r.comanda, dt: r.dt, caixa: r.caixa, supervisor: r.supervisor, value: r.value, produto: r.produto }));

  // Sinais de fraude
  const flags: CancelFlag[] = [];
  if (byCaixa[0] && byCaixa[0].pct >= 50) flags.push({ level: 'high', text: `Concentração: o caixa "${byCaixa[0].name}" responde por ${byCaixa[0].pct}% do valor cancelado (R$ ${byCaixa[0].value.toFixed(2)}).` });
  if (bySupervisor[0] && bySupervisor[0].pct >= 50) flags.push({ level: 'high', text: `Autorização concentrada: "${bySupervisor[0].name}" autorizou ${bySupervisor[0].pct}% do valor (R$ ${bySupervisor[0].value.toFixed(2)}) — verifique se o cartão foi emprestado.` });
  // supervisor com valor MÉDIO muito acima dos colegas
  if (bySupervisor.length >= 2) {
    const avgs = bySupervisor.map((s) => s.avg).sort((a, b) => a - b);
    const median = avgs[Math.floor(avgs.length / 2)];
    for (const s of bySupervisor) if (median > 0 && s.avg >= median * 2 && s.count >= 5) flags.push({ level: 'medium', text: `"${s.name}" autoriza cancelamentos de valor médio (R$ ${s.avg.toFixed(2)}) muito acima da mediana (R$ ${median.toFixed(2)}).` });
  }
  if (highValueCount > 0) flags.push({ level: highValueCount >= 10 ? 'high' : 'medium', text: `${highValueCount} cancelamento(s) acima de R$ ${HIGH},00 (maior: R$ ${maxValue.toFixed(2)}).` });
  const peakHour = byHour.slice().sort((a, b) => b.count - a.count)[0];
  if (peakHour && records.length > 0 && peakHour.count >= Math.max(5, records.length * 0.25)) flags.push({ level: 'medium', text: `Pico de cancelamentos às ${String(peakHour.hour).padStart(2, '0')}h (${peakHour.count} ocorrências) — janela de menor supervisão?` });

  return { totalCount: records.length, totalValue, data: { byCaixa, bySupervisor, byOperador, byHour, byDay, topValue, flags, highValueCount, maxValue } };
}

export async function saveCancellationAnalysis(user: SessionUser, unitId: string, buffer: Buffer, fileName: string | undefined, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<{ ok: true; id: string; flags: number } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' }> {
  if (!['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  let parsed;
  try { parsed = await parseCancellationPdf(buffer); } catch { return { ok: false, reason: 'INVALID' }; }
  if (parsed.records.length === 0) return { ok: false, reason: 'INVALID' };
  const { totalCount, totalValue, data } = analyzeCancellations(parsed.records);
  const rec = await prisma.cancellationAnalysis.create({
    data: { unitId, createdById: user.id, createdByName: user.name, filial: parsed.filial, period: parsed.period, fileName: fileName ?? null, totalCount, totalValue, data: data as unknown as object },
    select: { id: true },
  });
  await audit({ userId: user.id, unitId, action: 'CANCEL_ANALYSIS', module: 'CANCELLATIONS', entity: 'cancellation_analysis', entityId: rec.id, metadata: { totalCount, totalValue, flags: data.flags.length }, ...ctx });
  return { ok: true, id: rec.id, flags: data.flags.length };
}

export async function listCancellationAnalyses(user: SessionUser, unitId: string) {
  if (!canAccessUnit(user, unitId)) return [];
  return prisma.cancellationAnalysis.findMany({ where: { unitId }, orderBy: { createdAt: 'desc' }, take: 24 });
}
