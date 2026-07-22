import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins, notifyUnitRole } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { CashMovementType, Prisma } from '@prisma/client';

/**
 * Gestão de Troco v2 — COFRE (16/07, modelo confirmado pelo Pedro + foto):
 * 1 cofre por unidade com saldo POR DENOMINAÇÃO (valor em R$ de cada uma,
 * como a folha do gerente). Baldes por caixa físico com valor-alvo do
 * supervisor. Rotina: repor baldes com miúdos do cofre (voltam notas grandes),
 * trocar notas grandes com o escritório por moedas. Retirada p/ pagamento é
 * PROIBIDA: registra, marca em vermelho e avisa supervisão na hora.
 */

/** Denominações do Real (a folha do gerente) + linha "outros". */
export const DENOMINATIONS = ['200', '100', '50', '20', '10', '5', '2', '1', '0.50', '0.25', '0.10', '0.05'] as const;
export const DENOM_KEYS = [...DENOMINATIONS, 'outros'] as const;
export type DenomKey = (typeof DENOM_KEYS)[number];
export type Balances = Record<string, number>;

/// notas grandes (indicador de "hora de pedir troca ao escritório")
const BIG_NOTES = ['200', '100', '50'];

type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND'; detail?: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function emptyBalances(): Balances {
  return Object.fromEntries(DENOM_KEYS.map((k) => [k, 0]));
}
export function sumBalances(b: Balances): number {
  return r2(DENOM_KEYS.reduce((t, k) => t + (Number(b[k]) || 0), 0));
}
function sanitize(input: Record<string, unknown>): Balances {
  const out = emptyBalances();
  for (const k of DENOM_KEYS) {
    const v = Number(input?.[k]);
    out[k] = Number.isFinite(v) ? r2(v) : 0;
  }
  return out;
}
/** Valor deve ser múltiplo da denominação (ex.: 0,10 → 50,00 ✓; 50,05 ✗). Tolerância 1 centavo. */
export function invalidMultiples(b: Balances): string[] {
  const bad: string[] = [];
  for (const d of DENOMINATIONS) {
    const denom = Number(d);
    const v = Number(b[d]) || 0;
    if (v > 0 && Math.abs(Math.round(v / denom) * denom - v) > 0.011) bad.push(d);
  }
  return bad;
}

function canOperate(user: SessionUser): boolean {
  return user.role !== 'FINANCE' && user.role !== 'CEO';
}
function canManageBuckets(user: SessionUser): boolean {
  return user.role === 'SUPERVISOR' || user.role === 'ADMIN';
}

async function getOrCreateVault(unitId: string) {
  return prisma.cashVault.upsert({
    where: { unitId },
    create: { unitId, balances: emptyBalances() as unknown as Prisma.InputJsonValue },
    update: {},
  });
}

async function applyMovement(
  user: SessionUser,
  unitId: string,
  type: CashMovementType,
  deltas: Balances,
  opts: { bucketId?: string | null; bucketName?: string | null; note?: string | null; replaceBalances?: Balances },
  ctx: Ctx,
): Promise<void> {
  const vault = await getOrCreateVault(unitId);
  const current = sanitize(vault.balances as Record<string, unknown>);
  let next: Balances;
  if (opts.replaceBalances) {
    next = opts.replaceBalances;
  } else {
    next = { ...current };
    for (const k of DENOM_KEYS) next[k] = r2((next[k] || 0) + (deltas[k] || 0));
  }
  const totalIn = r2(DENOM_KEYS.reduce((t, k) => t + Math.max(0, deltas[k] || 0), 0));
  const totalOut = r2(DENOM_KEYS.reduce((t, k) => t + Math.max(0, -(deltas[k] || 0)), 0));

  await prisma.$transaction([
    prisma.cashVault.update({ where: { id: vault.id }, data: { balances: next as unknown as Prisma.InputJsonValue } }),
    prisma.cashVaultMovement.create({
      data: {
        unitId, type, bucketId: opts.bucketId ?? null, bucketName: opts.bucketName ?? null,
        deltas: deltas as unknown as Prisma.InputJsonValue, totalIn, totalOut,
        note: opts.note ?? null, createdById: user.id, createdByName: user.name,
      },
    }),
  ]);
  await audit({ userId: user.id, unitId, action: `CASH_VAULT_${type}`, module: 'CASH', entity: 'cash_vault', entityId: vault.id, metadata: { totalIn, totalOut, bucket: opts.bucketName }, ...ctx });
}

/** Conferência/posição completa (como a folha): SUBSTITUI o saldo do cofre. */
export async function countVault(user: SessionUser, unitId: string, balancesInput: Record<string, unknown>, note: string | undefined, ctx: Ctx = {}): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const counted = sanitize(balancesInput);
  const vault = await getOrCreateVault(unitId);
  const current = sanitize(vault.balances as Record<string, unknown>);
  const deltas = emptyBalances();
  for (const k of DENOM_KEYS) deltas[k] = r2((counted[k] || 0) - (current[k] || 0));
  await applyMovement(user, unitId, 'COUNT', deltas, { note: note?.trim() || null, replaceBalances: counted }, ctx);
  return { ok: true };
}

/** Reposição de balde: SAEM miúdos do cofre, ENTRAM notas grandes do balde (troca 1:1). */
export async function refillBucket(
  user: SessionUser, unitId: string, bucketId: string,
  outSmall: Record<string, unknown>, inBig: Record<string, unknown>, note: string | undefined, ctx: Ctx = {},
): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const bucket = await prisma.cashBucket.findUnique({ where: { id: bucketId }, select: { unitId: true, name: true } });
  if (!bucket || bucket.unitId !== unitId) return { ok: false, reason: 'NOT_FOUND' };
  const outB = sanitize(outSmall);
  const inB = sanitize(inBig);
  const outTotal = sumBalances(outB);
  const inTotal = sumBalances(inB);
  if (outTotal <= 0) return { ok: false, reason: 'INVALID', detail: 'Informe o que saiu do cofre para o balde.' };
  if (Math.abs(outTotal - inTotal) > 0.011) {
    return { ok: false, reason: 'INVALID', detail: `Troca desigual: saiu ${outTotal.toFixed(2)} e entrou ${inTotal.toFixed(2)} — os valores devem ser iguais (troca 1:1).` };
  }
  const deltas = emptyBalances();
  for (const k of DENOM_KEYS) deltas[k] = r2((inB[k] || 0) - (outB[k] || 0));
  await applyMovement(user, unitId, 'REFILL', deltas, { bucketId, bucketName: bucket.name, note: note?.trim() || null }, ctx);
  return { ok: true };
}

/** Troca com o escritório: SAEM notas grandes, ENTRAM moedas/miúdos (mesmo valor). */
export async function officeSwap(
  user: SessionUser, unitId: string,
  outBig: Record<string, unknown>, inSmall: Record<string, unknown>, note: string | undefined, ctx: Ctx = {},
): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const outB = sanitize(outBig);
  const inB = sanitize(inSmall);
  const outTotal = sumBalances(outB);
  const inTotal = sumBalances(inB);
  if (outTotal <= 0) return { ok: false, reason: 'INVALID', detail: 'Informe as notas enviadas ao escritório.' };
  if (Math.abs(outTotal - inTotal) > 0.011) {
    return { ok: false, reason: 'INVALID', detail: `Troca desigual: enviou ${outTotal.toFixed(2)} e recebeu ${inTotal.toFixed(2)} — os valores devem ser iguais.` };
  }
  const deltas = emptyBalances();
  for (const k of DENOM_KEYS) deltas[k] = r2((inB[k] || 0) - (outB[k] || 0));
  await applyMovement(user, unitId, 'OFFICE_SWAP', deltas, { note: note?.trim() || null }, ctx);
  return { ok: true };
}

/** Retirada p/ pagamento — PROIBIDA: registra em vermelho e avisa supervisão na hora. */
export async function vaultWithdrawal(user: SessionUser, unitId: string, amounts: Record<string, unknown>, reason: string, ctx: Ctx = {}): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const outB = sanitize(amounts);
  const total = sumBalances(outB);
  if (total <= 0) return { ok: false, reason: 'INVALID' };
  if (!reason?.trim()) return { ok: false, reason: 'INVALID', detail: 'Informe o motivo da retirada.' };
  const deltas = emptyBalances();
  for (const k of DENOM_KEYS) deltas[k] = -(outB[k] || 0);
  await applyMovement(user, unitId, 'WITHDRAWAL', deltas, { note: reason.trim() }, ctx);

  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } });
  const brl = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const payload = {
    title: '🚨 Retirada do troco para pagamento (PROIBIDA)',
    body: `${user.name} retirou ${brl} do cofre de ${unit?.name ?? 'unidade'} para pagamento — motivo: ${reason.trim()}. A reposição precisa ser cobrada.`,
    link: '/modulos/troco', module: 'CASH', critical: true,
  };
  await notifyUnitRole(unitId, 'SUPERVISOR', payload).catch(() => {});
  await notifyAdmins(payload).catch(() => {});
  return { ok: true };
}

/* ───────── Baldes (supervisor fixa o valor) ───────── */
export async function upsertBucket(user: SessionUser, input: { id?: string; unitId: string; name: string; targetValue: number }, ctx: Ctx = {}): Promise<Result> {
  if (!canManageBuckets(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.name?.trim() || !(input.targetValue > 0)) return { ok: false, reason: 'INVALID' };
  if (input.id) {
    await prisma.cashBucket.update({ where: { id: input.id }, data: { name: input.name.trim(), targetValue: input.targetValue } });
  } else {
    await prisma.cashBucket.create({ data: { unitId: input.unitId, name: input.name.trim(), targetValue: input.targetValue } });
  }
  await audit({ userId: user.id, unitId: input.unitId, action: 'CASH_BUCKET_SET', module: 'CASH', entity: 'cash_bucket', metadata: { name: input.name, target: input.targetValue }, ...ctx });
  return { ok: true };
}

export async function toggleBucket(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<Result> {
  if (!canManageBuckets(user)) return { ok: false, reason: 'FORBIDDEN' };
  const b = await prisma.cashBucket.findUnique({ where: { id }, select: { unitId: true } });
  if (!b) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.cashBucket.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, unitId: b.unitId, action: active ? 'CASH_BUCKET_ON' : 'CASH_BUCKET_OFF', module: 'CASH', entity: 'cash_bucket', entityId: id, ...ctx });
  return { ok: true };
}

/** Exclui o balde por completo (Supervisão/Admin). Os movimentos guardam o nome (snapshot). */
export async function deleteBucket(user: SessionUser, id: string, ctx: Ctx = {}): Promise<Result> {
  if (!canManageBuckets(user)) return { ok: false, reason: 'FORBIDDEN' };
  const b = await prisma.cashBucket.findUnique({ where: { id }, select: { unitId: true, name: true } });
  if (!b) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.cashBucket.delete({ where: { id } });
  await audit({ userId: user.id, unitId: b.unitId, action: 'CASH_BUCKET_DELETE', module: 'CASH', entity: 'cash_bucket', entityId: id, metadata: { name: b.name }, ...ctx });
  return { ok: true };
}

/* ───────── Visões ───────── */
export interface VaultOverview {
  balances: Balances;
  total: number;
  bigNotesTotal: number; // notas grandes (50/100/200) — indicador p/ pedir troca
  bigNotesPct: number;
  buckets: { id: string; name: string; targetValue: number; active: boolean }[];
  movements: {
    id: string; type: CashMovementType; bucketName: string | null; totalIn: number; totalOut: number;
    note: string | null; createdByName: string; createdAt: string; deltas: Balances;
  }[];
  monthWithdrawals: number;
  lastCountAt: string | null;
}

export async function getVaultOverview(user: SessionUser, unitId: string): Promise<VaultOverview | null> {
  if (!canAccessUnit(user, unitId)) return null;
  const vault = await getOrCreateVault(unitId);
  const balances = sanitize(vault.balances as Record<string, unknown>);
  const total = sumBalances(balances);
  const bigNotesTotal = r2(BIG_NOTES.reduce((t, k) => t + (balances[k] || 0), 0));
  const ym = new Date().toISOString().slice(0, 7);

  const [buckets, movements, monthWithdrawals, lastCount] = await Promise.all([
    prisma.cashBucket.findMany({ where: { unitId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.cashVaultMovement.findMany({ where: { unitId }, orderBy: { createdAt: 'desc' }, take: 40 }),
    prisma.cashVaultMovement.count({ where: { unitId, type: 'WITHDRAWAL', createdAt: { gte: new Date(`${ym}-01T00:00:00Z`) } } }),
    prisma.cashVaultMovement.findFirst({ where: { unitId, type: 'COUNT' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);

  return {
    balances, total, bigNotesTotal,
    bigNotesPct: total > 0 ? Math.round((bigNotesTotal / total) * 100) : 0,
    buckets: buckets.map((b) => ({ id: b.id, name: b.name, targetValue: Number(b.targetValue), active: b.active })),
    movements: movements.map((m) => ({
      id: m.id, type: m.type, bucketName: m.bucketName, totalIn: Number(m.totalIn), totalOut: Number(m.totalOut),
      note: m.note, createdByName: m.createdByName, createdAt: m.createdAt.toISOString(),
      deltas: sanitize(m.deltas as Record<string, unknown>),
    })),
    monthWithdrawals,
    lastCountAt: lastCount?.createdAt.toISOString() ?? null,
  };
}

/** Retiradas proibidas do mês por unidade (Supervisão/Admin/CEO + Visão Executiva). */
export async function getVaultAlerts(user: SessionUser, yearMonth: string): Promise<{ unitId: string; unitName: string; withdrawals: number; withdrawnTotal: number; vaultTotal: number }[]> {
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const start = new Date(`${yearMonth}-01T00:00:00Z`);
  const [y, m] = yearMonth.split('-').map(Number);
  const end = new Date(Date.UTC(y, m, 1));
  const out = [];
  for (const u of units) {
    const [wd, vault] = await Promise.all([
      prisma.cashVaultMovement.aggregate({ where: { unitId: u.id, type: 'WITHDRAWAL', createdAt: { gte: start, lt: end } }, _count: true, _sum: { totalOut: true } }),
      prisma.cashVault.findUnique({ where: { unitId: u.id }, select: { balances: true } }),
    ]);
    out.push({
      unitId: u.id, unitName: u.name,
      withdrawals: wd._count, withdrawnTotal: r2(Number(wd._sum.totalOut ?? 0)),
      vaultTotal: vault ? sumBalances(sanitize(vault.balances as Record<string, unknown>)) : 0,
    });
  }
  return out.sort((a, b) => b.withdrawals - a.withdrawals);
}
