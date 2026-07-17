import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUnitRole } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Lançamento fora do prazo (item 4 do pacote 07/07):
 * Admin/Supervisor podem EDITAR a data de um lançamento (Pagamentos, Notas,
 * Gás, Óleo) quando o gerente esqueceu de lançar no dia. Cada edição marca
 * `dateEdited` e desconta LATE_ENTRY_PENALTY_PCT (% por lançamento, padrão 2)
 * da meta do mês da unidade. O gerente é avisado.
 */
const PENALTY_KEY = 'LATE_ENTRY_PENALTY_PCT';
const DEFAULT_PENALTY = 2;

export type LateEntryModule = 'payment' | 'note' | 'gas' | 'oil';
type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function getLateEntryPenaltyPct(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: PENALTY_KEY } });
  const n = s ? Number(s.value) : DEFAULT_PENALTY;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_PENALTY;
}

export async function setLateEntryPenaltyPct(user: SessionUser, pct: number) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  const v = Math.max(0, Math.min(100, Number(pct)));
  if (!Number.isFinite(v)) return { ok: false as const, reason: 'INVALID' as const };
  await prisma.appSetting.upsert({ where: { key: PENALTY_KEY }, create: { key: PENALTY_KEY, value: String(v) }, update: { value: String(v) } });
  await audit({ userId: user.id, action: 'LATE_ENTRY_PENALTY_SET', module: 'CONFIG', metadata: { pct: v } });
  return { ok: true as const };
}

/** Edita a data efetiva de um lançamento (Admin/Supervisor). Marca e avisa. */
export async function editEntryDate(user: SessionUser, module: LateEntryModule, id: string, newDate: string, ctx: Ctx = {}): Promise<Result> {
  if (user.role !== 'ADMIN' && user.role !== 'SUPERVISOR') return { ok: false, reason: 'FORBIDDEN' };
  if (!DATE_RE.test(newDate ?? '')) return { ok: false, reason: 'INVALID' };
  const today = new Date().toISOString().slice(0, 10);
  if (newDate > today) return { ok: false, reason: 'INVALID' };

  let unitId: string | null = null;
  let label = '';
  if (module === 'payment') {
    const r = await prisma.paymentRequest.findUnique({ where: { id }, select: { unitId: true } });
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    if (!canAccessUnit(user, r.unitId)) return { ok: false, reason: 'FORBIDDEN' };
    await prisma.paymentRequest.update({ where: { id }, data: { entryDate: new Date(newDate + 'T12:00:00Z'), dateEdited: true, dateEditedByName: user.name } });
    unitId = r.unitId; label = 'Pagamento';
  } else if (module === 'note') {
    const r = await prisma.receivedNote.findUnique({ where: { id }, select: { unitId: true, supplierName: true } });
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    if (!canAccessUnit(user, r.unitId)) return { ok: false, reason: 'FORBIDDEN' };
    await prisma.receivedNote.update({ where: { id }, data: { entryDate: new Date(newDate + 'T12:00:00Z'), dateEdited: true, dateEditedByName: user.name } });
    unitId = r.unitId; label = `Nota (${r.supplierName})`;
  } else if (module === 'gas') {
    const r = await prisma.gasReceipt.findUnique({ where: { id }, select: { unitId: true } });
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    if (!canAccessUnit(user, r.unitId)) return { ok: false, reason: 'FORBIDDEN' };
    await prisma.gasReceipt.update({ where: { id }, data: { operationalDate: newDate, dateEdited: true, dateEditedByName: user.name } });
    unitId = r.unitId; label = 'Recebimento de gás';
  } else if (module === 'oil') {
    const r = await prisma.oilCollection.findUnique({ where: { id }, select: { unitId: true } });
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    if (!canAccessUnit(user, r.unitId)) return { ok: false, reason: 'FORBIDDEN' };
    await prisma.oilCollection.update({ where: { id }, data: { operationalDate: newDate, dateEdited: true, dateEditedByName: user.name } });
    unitId = r.unitId; label = 'Coleta de óleo';
  } else {
    return { ok: false, reason: 'INVALID' };
  }

  const pct = await getLateEntryPenaltyPct();
  await audit({ userId: user.id, unitId: unitId!, action: 'ENTRY_DATE_EDITED', module: 'META', entity: module, entityId: id, metadata: { newDate, penaltyPct: pct }, ...ctx });
  await notifyUnitRole(unitId!, 'MANAGER', {
    title: 'Lançamento fora do prazo (data corrigida)',
    body: `${user.name} corrigiu a data de um lançamento (${label}) para ${newDate.split('-').reverse().join('/')}. Isso desconta ${pct}% na meta do mês da unidade.`,
    link: '/modulos/metas', module: 'META', critical: true,
  }).catch(() => {});
  return { ok: true };
}

/**
 * Nº de lançamentos "fora do prazo" no mês (base da penalidade da meta):
 * datas editadas por Admin/Supervisor + notas que a supervisão precisou lançar
 * porque o gerente esqueceu (decisão do Pedro 16/07).
 */
export async function countLateEntries(unitId: string, yearMonth: string): Promise<number> {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const [pay, note, gas, oil, supLaunched] = await Promise.all([
    prisma.paymentRequest.count({ where: { unitId, dateEdited: true, entryDate: { gte: start, lt: end } } }),
    prisma.receivedNote.count({ where: { unitId, dateEdited: true, entryDate: { gte: start, lt: end } } }),
    prisma.gasReceipt.count({ where: { unitId, dateEdited: true, operationalDate: { startsWith: yearMonth } } }),
    prisma.oilCollection.count({ where: { unitId, dateEdited: true, operationalDate: { startsWith: yearMonth } } }),
    prisma.receivedNote.count({ where: { unitId, supervisorLaunched: true, dateEdited: false, createdAt: { gte: start, lt: end } } }),
  ]);
  return pay + note + gas + oil + supLaunched;
}
