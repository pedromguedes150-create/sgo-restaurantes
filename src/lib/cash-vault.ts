import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifySupervisory, notifyUsers } from '@/lib/notifications';
import { isSupervisory } from '@/lib/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { CashMovementType, ChangeRequestStatus, Prisma } from '@prisma/client';

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
  return isSupervisory(user.role); // SUPERVISOR + COORDINATOR + ADMIN
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
  await notifySupervisory(payload, unitId).catch(() => {});
  return { ok: true };
}

/**
 * Troca de dinheiro DIRETO no caixa (unidades sem baldes, ex.: Nova União).
 * Igual à reposição, mas sem balde: sai um conjunto do cofre e entra outro de
 * valor igual (o caixa troca notas por moedas/miúdos ali mesmo). Fica no histórico.
 */
export async function registerChange(
  user: SessionUser, unitId: string, registerName: string,
  outFromVault: Record<string, unknown>, inToVault: Record<string, unknown>, note: string | undefined, ctx: Ctx = {},
): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!registerName?.trim()) return { ok: false, reason: 'INVALID', detail: 'Informe qual caixa.' };
  const outB = sanitize(outFromVault);
  const inB = sanitize(inToVault);
  const outTotal = sumBalances(outB);
  const inTotal = sumBalances(inB);
  if (outTotal <= 0) return { ok: false, reason: 'INVALID', detail: 'Informe o que saiu do cofre para o caixa.' };
  if (Math.abs(outTotal - inTotal) > 0.011) {
    return { ok: false, reason: 'INVALID', detail: `Troca desigual: saiu ${outTotal.toFixed(2)} e entrou ${inTotal.toFixed(2)} — os valores devem ser iguais (troca 1:1).` };
  }
  const deltas = emptyBalances();
  for (const k of DENOM_KEYS) deltas[k] = r2((inB[k] || 0) - (outB[k] || 0));
  await applyMovement(user, unitId, 'REGISTER_CHANGE', deltas, { bucketName: registerName.trim(), note: note?.trim() || null }, ctx);
  return { ok: true };
}

/* ───────── Solicitação de troco (gerente → supervisão) ───────── */

/** Gerente (ou quem opera) pede troco à supervisão; SUPERVISOR+COORDINATOR+ADMIN são notificados. */
export async function requestChange(user: SessionUser, unitId: string, input: { amount?: number | null; note: string }, ctx: Ctx = {}): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const note = (input.note ?? '').trim();
  if (!note) return { ok: false, reason: 'INVALID', detail: 'Descreva o troco que você precisa.' };
  const amount = input.amount != null && input.amount > 0 ? r2(input.amount) : null;

  const req = await prisma.cashChangeRequest.create({
    data: { unitId, amount, note, requestedById: user.id, requestedByName: user.name },
    select: { id: true },
  });
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } });
  const valuePart = amount ? ` (${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` : '';
  await notifySupervisory(
    {
      title: '💱 Solicitação de troco',
      body: `${user.name} pediu troco em ${unit?.name ?? 'unidade'}${valuePart}: ${note}`,
      link: '/modulos/troco', module: 'CASH',
    },
    unitId,
  ).catch(() => {});
  await audit({ userId: user.id, unitId, action: 'CASH_CHANGE_REQUEST', module: 'CASH', entity: 'cash_change_request', entityId: req.id, metadata: { amount, note }, ...ctx });
  return { ok: true };
}

/** Supervisão resolve, ou o próprio solicitante cancela, uma solicitação de troco. */
export async function resolveChangeRequest(user: SessionUser, id: string, action: 'resolve' | 'cancel', resolvedNote: string | undefined, ctx: Ctx = {}): Promise<Result> {
  const req = await prisma.cashChangeRequest.findUnique({ where: { id } });
  if (!req) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, req.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (req.status !== 'OPEN') return { ok: false, reason: 'INVALID', detail: 'Esta solicitação já foi encerrada.' };
  if (action === 'resolve' && !isSupervisory(user.role)) return { ok: false, reason: 'FORBIDDEN', detail: 'Só a supervisão pode atender.' };
  if (action === 'cancel' && req.requestedById !== user.id && !isSupervisory(user.role)) return { ok: false, reason: 'FORBIDDEN' };

  await prisma.cashChangeRequest.update({
    where: { id },
    data: { status: action === 'resolve' ? 'RESOLVED' : 'CANCELED', resolvedById: user.id, resolvedByName: user.name, resolvedNote: resolvedNote?.trim() || null, resolvedAt: new Date() },
  });
  if (action === 'resolve') {
    await notifyUsers([req.requestedById], {
      title: '✅ Troco atendido',
      body: `${user.name} atendeu seu pedido de troco${resolvedNote?.trim() ? `: ${resolvedNote.trim()}` : '.'}`,
      link: '/modulos/troco', module: 'CASH',
    }).catch(() => {});
  }
  await audit({ userId: user.id, unitId: req.unitId, action: action === 'resolve' ? 'CASH_CHANGE_RESOLVE' : 'CASH_CHANGE_CANCEL', module: 'CASH', entity: 'cash_change_request', entityId: id, ...ctx });
  return { ok: true };
}

export interface ChangeRequestUI {
  id: string; unitId: string; unitName?: string; amount: number | null; note: string;
  status: ChangeRequestStatus; requestedByName: string; createdAt: string;
  resolvedByName: string | null; resolvedNote: string | null; resolvedAt: string | null;
}

/** Solicitações de troco de uma unidade (abertas primeiro). */
export async function getChangeRequests(user: SessionUser, unitId: string): Promise<ChangeRequestUI[]> {
  if (!canAccessUnit(user, unitId)) return [];
  const rows = await prisma.cashChangeRequest.findMany({ where: { unitId }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 50 });
  return rows.map((r) => ({
    id: r.id, unitId: r.unitId, amount: r.amount != null ? Number(r.amount) : null, note: r.note, status: r.status,
    requestedByName: r.requestedByName, createdAt: r.createdAt.toISOString(),
    resolvedByName: r.resolvedByName, resolvedNote: r.resolvedNote, resolvedAt: r.resolvedAt?.toISOString() ?? null,
  }));
}

/**
 * Solicitações de troco ABERTAS nas unidades do usuário (para destaque/badge da
 * supervisão). Retorna as unidades com pendência para a aba de Troco realçar.
 */
export async function getOpenChangeRequests(user: SessionUser): Promise<ChangeRequestUI[]> {
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, select: { id: true, name: true } });
  const nameById = new Map(units.map((u) => [u.id, u.name]));
  if (nameById.size === 0) return [];
  const rows = await prisma.cashChangeRequest.findMany({
    where: { status: 'OPEN', unitId: { in: [...nameById.keys()] } },
    orderBy: { createdAt: 'desc' }, take: 100,
  });
  return rows.map((r) => ({
    id: r.id, unitId: r.unitId, unitName: nameById.get(r.unitId), amount: r.amount != null ? Number(r.amount) : null, note: r.note,
    status: r.status, requestedByName: r.requestedByName, createdAt: r.createdAt.toISOString(),
    resolvedByName: null, resolvedNote: null, resolvedAt: null,
  }));
}

/* ───────── Histórico filtrável de movimentações ───────── */

export interface VaultHistoryFilters {
  types?: CashMovementType[];
  userId?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD (inclusive)
  minValue?: number;
  maxValue?: number;
  sort?: 'date_desc' | 'date_asc' | 'value_desc' | 'value_asc';
}
export interface MovementUI {
  id: string; type: CashMovementType; bucketName: string | null; totalIn: number; totalOut: number;
  value: number; note: string | null; createdByName: string; createdById: string; createdAt: string; deltas: Balances;
}
export interface VaultHistoryResult {
  rows: MovementUI[];
  users: { id: string; name: string }[];
  total: number;
}

/** Histórico completo do cofre da unidade, com filtros e ordenação. */
export async function getVaultHistory(user: SessionUser, unitId: string, f: VaultHistoryFilters = {}): Promise<VaultHistoryResult | null> {
  if (!canAccessUnit(user, unitId)) return null;

  const where: Prisma.CashVaultMovementWhereInput = { unitId };
  if (f.types?.length) where.type = { in: f.types };
  if (f.userId) where.createdById = f.userId;
  if (f.from || f.to) {
    where.createdAt = {};
    if (f.from) where.createdAt.gte = new Date(`${f.from}T00:00:00`);
    if (f.to) where.createdAt.lte = new Date(`${f.to}T23:59:59.999`);
  }

  const [raw, distinctUsers] = await Promise.all([
    prisma.cashVaultMovement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 800 }),
    prisma.cashVaultMovement.findMany({ where: { unitId }, distinct: ['createdById'], select: { createdById: true, createdByName: true }, orderBy: { createdByName: 'asc' } }),
  ]);

  let rows: MovementUI[] = raw.map((m) => {
    const totalIn = Number(m.totalIn); const totalOut = Number(m.totalOut);
    return {
      id: m.id, type: m.type, bucketName: m.bucketName, totalIn, totalOut,
      value: Math.max(totalIn, totalOut), note: m.note, createdByName: m.createdByName, createdById: m.createdById,
      createdAt: m.createdAt.toISOString(), deltas: sanitize(m.deltas as Record<string, unknown>),
    };
  });

  if (f.minValue != null) rows = rows.filter((r) => r.value >= f.minValue!);
  if (f.maxValue != null) rows = rows.filter((r) => r.value <= f.maxValue!);

  const sort = f.sort ?? 'date_desc';
  rows.sort((a, b) =>
    sort === 'date_asc' ? a.createdAt.localeCompare(b.createdAt)
      : sort === 'value_desc' ? b.value - a.value
      : sort === 'value_asc' ? a.value - b.value
      : b.createdAt.localeCompare(a.createdAt),
  );

  return {
    rows,
    users: distinctUsers.map((u) => ({ id: u.createdById, name: u.createdByName })),
    total: rows.length,
  };
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
  recentMovements: {
    id: string; type: CashMovementType; bucketName: string | null; totalIn: number; totalOut: number;
    note: string | null; createdByName: string; createdAt: string; deltas: Balances;
  }[];
  changeRequests: ChangeRequestUI[]; // solicitações de troco desta unidade (abertas primeiro)
  openChangeCount: number;
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

  const [buckets, movements, monthWithdrawals, lastCount, changeRequests] = await Promise.all([
    prisma.cashBucket.findMany({ where: { unitId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.cashVaultMovement.findMany({ where: { unitId }, orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.cashVaultMovement.count({ where: { unitId, type: 'WITHDRAWAL', createdAt: { gte: new Date(`${ym}-01T00:00:00Z`) } } }),
    prisma.cashVaultMovement.findFirst({ where: { unitId, type: 'COUNT' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    getChangeRequests(user, unitId),
  ]);

  return {
    balances, total, bigNotesTotal,
    bigNotesPct: total > 0 ? Math.round((bigNotesTotal / total) * 100) : 0,
    buckets: buckets.map((b) => ({ id: b.id, name: b.name, targetValue: Number(b.targetValue), active: b.active })),
    recentMovements: movements.map((m) => ({
      id: m.id, type: m.type, bucketName: m.bucketName, totalIn: Number(m.totalIn), totalOut: Number(m.totalOut),
      note: m.note, createdByName: m.createdByName, createdAt: m.createdAt.toISOString(),
      deltas: sanitize(m.deltas as Record<string, unknown>),
    })),
    changeRequests,
    openChangeCount: changeRequests.filter((c) => c.status === 'OPEN').length,
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
