import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins, notifyUnitRole } from '@/lib/notifications';
import { currentOperationalDate } from '@/lib/date/operational';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Módulo 16 — Gestão de Troco (sessões de caixa em CADEIA).
 * O fechamento de um caixa é a abertura ESPERADA do próximo — inclusive entre
 * dias (o troco pernoita). Abertura digitada ≠ fechamento anterior gera
 * divergência e alerta (supervisor da unidade + admins). 1+ caixas por dia.
 */
type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND'; detail?: string };

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const round2 = (n: number) => Math.round(n * 100) / 100;

function canOperate(user: SessionUser): boolean {
  return user.role !== 'FINANCE' && user.role !== 'CEO';
}

/** Abre um caixa. A abertura esperada é o fechamento do último caixa fechado. */
export async function openCashSession(user: SessionUser, unitId: string, openingAmount: number, note?: string, ctx: Ctx = {}): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const amount = round2(Number(openingAmount));
  if (!Number.isFinite(amount) || amount < 0 || amount > 99999999) return { ok: false, reason: 'INVALID' };

  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { name: true, timezone: true, cutoffHour: true } });
  if (!unit) return { ok: false, reason: 'NOT_FOUND' };

  const open = await prisma.cashSession.findFirst({ where: { unitId, closingAmount: null }, select: { id: true } });
  if (open) return { ok: false, reason: 'INVALID', detail: 'Já existe um caixa aberto nesta unidade — feche-o antes de abrir o próximo.' };

  // Cadeia: último caixa FECHADO da unidade (qualquer dia — o troco pernoita)
  const last = await prisma.cashSession.findFirst({
    where: { unitId, closingAmount: { not: null } },
    orderBy: { closedAt: 'desc' },
    select: { closingAmount: true },
  });
  const expected = last?.closingAmount != null ? Number(last.closingAmount) : null;
  const divergence = expected != null ? round2(amount - expected) : null;

  const opDate = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  const seq = (await prisma.cashSession.count({ where: { unitId, operationalDate: opDate } })) + 1;

  const s = await prisma.cashSession.create({
    data: {
      unitId, operationalDate: opDate, seq,
      openingAmount: amount, expectedOpening: expected, divergence,
      note: note?.trim() || null, openedById: user.id, openedByName: user.name,
    },
  });
  await audit({ userId: user.id, unitId, action: 'CASH_OPEN', module: 'CASH', entity: 'cash_session', entityId: s.id, metadata: { opDate, seq, amount, expected, divergence }, ...ctx });

  if (divergence != null && Math.abs(divergence) >= 0.01) {
    const p = {
      title: 'Divergência de troco na abertura',
      body: `${unit.name}: caixa ${seq} de ${opDate.split('-').reverse().join('/')} abriu com ${brl(amount)}, mas o fechamento anterior foi ${brl(expected!)} (diferença de ${brl(divergence)}). Aberto por ${user.name}.`,
      link: '/modulos/troco', module: 'CASH', critical: true,
    };
    await notifyUnitRole(unitId, 'SUPERVISOR', p);
    await notifyAdmins(p);
  }
  return { ok: true, id: s.id };
}

/** Fecha o caixa aberto (o valor vira a abertura esperada do próximo). */
export async function closeCashSession(user: SessionUser, id: string, closingAmount: number, note?: string, ctx: Ctx = {}): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  const s = await prisma.cashSession.findUnique({ where: { id }, select: { unitId: true, closingAmount: true, seq: true, operationalDate: true, note: true } });
  if (!s) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, s.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (s.closingAmount != null) return { ok: false, reason: 'INVALID', detail: 'Este caixa já foi fechado.' };
  const amount = round2(Number(closingAmount));
  if (!Number.isFinite(amount) || amount < 0 || amount > 99999999) return { ok: false, reason: 'INVALID' };

  // updateMany condicional = transacional (só fecha se ainda estiver aberto)
  const r = await prisma.cashSession.updateMany({
    where: { id, closingAmount: null },
    data: {
      closingAmount: amount, closedById: user.id, closedByName: user.name, closedAt: new Date(),
      ...(note?.trim() ? { note: s.note ? `${s.note} · ${note.trim()}` : note.trim() } : {}),
    },
  });
  if (r.count === 0) return { ok: false, reason: 'INVALID', detail: 'Este caixa já foi fechado.' };
  await audit({ userId: user.id, unitId: s.unitId, action: 'CASH_CLOSE', module: 'CASH', entity: 'cash_session', entityId: id, metadata: { opDate: s.operationalDate, seq: s.seq, amount }, ...ctx });
  return { ok: true };
}

export interface CashSessionRow {
  id: string; operationalDate: string; seq: number;
  openingAmount: number; expectedOpening: number | null; divergence: number | null;
  closingAmount: number | null; note: string | null;
  openedByName: string; openedAt: string; closedByName: string | null; closedAt: string | null;
}

function toRow(s: {
  id: string; operationalDate: string; seq: number; openingAmount: unknown; expectedOpening: unknown;
  divergence: unknown; closingAmount: unknown; note: string | null; openedByName: string; openedAt: Date;
  closedByName: string | null; closedAt: Date | null;
}): CashSessionRow {
  return {
    id: s.id, operationalDate: s.operationalDate, seq: s.seq,
    openingAmount: Number(s.openingAmount),
    expectedOpening: s.expectedOpening != null ? Number(s.expectedOpening) : null,
    divergence: s.divergence != null ? Number(s.divergence) : null,
    closingAmount: s.closingAmount != null ? Number(s.closingAmount) : null,
    note: s.note, openedByName: s.openedByName, openedAt: s.openedAt.toISOString(),
    closedByName: s.closedByName, closedAt: s.closedAt ? s.closedAt.toISOString() : null,
  };
}

export interface CashOverview {
  openSession: CashSessionRow | null;
  lastClosing: number | null; // abertura esperada do próximo caixa
  today: CashSessionRow[];
  history: CashSessionRow[]; // últimas sessões (fora o dia atual)
  month: { sessions: number; divergent: number; divergenceTotal: number };
}

/** Visão da unidade: caixa aberto, dia atual, histórico e estatística do mês. */
export async function getCashOverview(user: SessionUser, unitId: string): Promise<CashOverview | null> {
  if (!canAccessUnit(user, unitId)) return null;
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { timezone: true, cutoffHour: true } });
  if (!unit) return null;
  const opDate = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  const yearMonth = opDate.slice(0, 7);

  const [open, todaySessions, monthSessions, history, last] = await Promise.all([
    prisma.cashSession.findFirst({ where: { unitId, closingAmount: null }, orderBy: { openedAt: 'desc' } }),
    prisma.cashSession.findMany({ where: { unitId, operationalDate: opDate }, orderBy: { seq: 'asc' } }),
    prisma.cashSession.findMany({ where: { unitId, operationalDate: { startsWith: yearMonth } }, select: { divergence: true } }),
    prisma.cashSession.findMany({ where: { unitId, operationalDate: { not: opDate } }, orderBy: [{ operationalDate: 'desc' }, { seq: 'desc' }], take: 40 }),
    prisma.cashSession.findFirst({ where: { unitId, closingAmount: { not: null } }, orderBy: { closedAt: 'desc' }, select: { closingAmount: true } }),
  ]);

  const divergent = monthSessions.filter((s) => s.divergence != null && Math.abs(Number(s.divergence)) >= 0.01);
  return {
    openSession: open ? toRow(open) : null,
    lastClosing: last?.closingAmount != null ? Number(last.closingAmount) : null,
    today: todaySessions.map(toRow),
    history: history.map(toRow),
    month: {
      sessions: monthSessions.length,
      divergent: divergent.length,
      divergenceTotal: round2(divergent.reduce((s, d) => s + Math.abs(Number(d.divergence)), 0)),
    },
  };
}

export interface CashDashboardRow { unitId: string; unitName: string; sessions: number; divergent: number; divergenceTotal: number }

/** Dashboard de divergências por unidade no mês (Supervisão/Admin/CEO). */
export async function getCashDashboard(user: SessionUser, yearMonth: string): Promise<CashDashboardRow[]> {
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const sessions = await prisma.cashSession.findMany({
    where: { unitId: { in: units.map((u) => u.id) }, operationalDate: { startsWith: yearMonth } },
    select: { unitId: true, divergence: true },
  });
  return units.map((u) => {
    const list = sessions.filter((s) => s.unitId === u.id);
    const div = list.filter((s) => s.divergence != null && Math.abs(Number(s.divergence)) >= 0.01);
    return {
      unitId: u.id, unitName: u.name, sessions: list.length, divergent: div.length,
      divergenceTotal: round2(div.reduce((sum, d) => sum + Math.abs(Number(d.divergence)), 0)),
    };
  }).sort((a, b) => b.divergenceTotal - a.divergenceTotal);
}
