import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { DivergenceOutcome } from '@prisma/client';

type Ctx = { ip?: string | null; userAgent?: string | null };
export type LifecycleResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' | 'CLOSED' };

function isResolver(user: SessionUser): boolean {
  return user.role === 'SUPERVISOR' || user.role === 'ADMIN' || user.role === 'CEO';
}

/** Coloca a divergência em apuração (Supervisor/Admin). */
export async function setInvestigating(user: SessionUser, id: string, ctx: Ctx = {}): Promise<LifecycleResult> {
  if (!isResolver(user)) return { ok: false, reason: 'FORBIDDEN' };
  const div = await prisma.commandDivergence.findUnique({ where: { id }, select: { unitId: true, status: true } });
  if (!div) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, div.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (div.status === 'CLOSED') return { ok: false, reason: 'CLOSED' };

  await prisma.commandDivergence.update({ where: { id }, data: { status: 'INVESTIGATING' } });
  await audit({ userId: user.id, unitId: div.unitId, action: 'COMMAND_DIV_INVESTIGATING', module: 'COMMANDS', entity: 'command_divergence', entityId: id, ...ctx });
  return { ok: true };
}

/**
 * Encerra a divergência (Supervisor/Admin): RECOVERED (volta à ativa) ou
 * LOST (baixa definitiva — sai da sequência ativa e não reaparece).
 */
export async function closeDivergence(
  user: SessionUser,
  id: string,
  outcome: DivergenceOutcome,
  ctx: Ctx = {},
): Promise<LifecycleResult> {
  if (!isResolver(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (outcome !== 'RECOVERED' && outcome !== 'LOST') return { ok: false, reason: 'INVALID' };
  const div = await prisma.commandDivergence.findUnique({ where: { id }, select: { unitId: true, status: true, number: true } });
  if (!div) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, div.unitId)) return { ok: false, reason: 'FORBIDDEN' };

  const res = await prisma.commandDivergence.updateMany({
    where: { id, status: { not: 'CLOSED' } },
    data: { status: 'CLOSED', outcome, resolvedById: user.id, resolvedAt: new Date() },
  });
  if (res.count === 0) return { ok: false, reason: 'CLOSED' };

  await audit({
    userId: user.id,
    unitId: div.unitId,
    action: outcome === 'LOST' ? 'COMMAND_DIV_LOST' : 'COMMAND_DIV_RECOVERED',
    module: 'COMMANDS',
    entity: 'command_divergence',
    entityId: id,
    metadata: { number: div.number },
    ...ctx,
  });
  return { ok: true };
}

/**
 * Reposição de comanda (Admin): cadastra a comanda nova. v1.202.0 — ela NASCE
 * aguardando o recebimento físico e só entra na sequência julgada quando alguém
 * da unidade confirma que a comanda chegou (`confirmarRecebimentoReposicao`):
 * contar como faltante uma comanda que ainda está no caminho abriria divergência
 * por nada.
 */
export async function addReplacement(
  user: SessionUser,
  unitId: string,
  number: number,
  note: string | undefined,
  ctx: Ctx = {},
): Promise<LifecycleResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!Number.isInteger(number)) return { ok: false, reason: 'INVALID' };

  await prisma.commandReplacement.upsert({
    where: { unitId_number: { unitId, number } },
    create: { unitId, number, note: note?.trim() || null, createdById: user.id },
    update: { note: note?.trim() || null },
  });
  /* a reposição de um número que já estava recebida continua recebida: só o cadastro novo espera */
  await audit({ userId: user.id, unitId, action: 'COMMAND_REPLACEMENT', module: 'COMMANDS', metadata: { number }, ...ctx });
  return { ok: true };
}


/** Quem confirma o recebimento físico: quem está na unidade conferindo (inclui o caixa) e a supervisão. */
const PERFIS_QUE_RECEBEM = ['CASHIER', 'MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN', 'CEO'];

/**
 * Confirma que a comanda de reposição CHEGOU fisicamente (v1.202.0). Idempotente:
 * confirmar de novo não muda quem/quando. Daí em diante o número é julgado como
 * qualquer outro da sequência. Fica registrado (quem, quando, observação) e na Auditoria.
 */
export async function confirmarRecebimentoReposicao(
  user: SessionUser,
  unitId: string,
  number: number,
  note: string | undefined,
  ctx: Ctx = {},
): Promise<LifecycleResult> {
  if (!PERFIS_QUE_RECEBEM.includes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!Number.isInteger(number)) return { ok: false, reason: 'INVALID' };
  const r = await prisma.commandReplacement.findUnique({ where: { unitId_number: { unitId, number } }, select: { id: true, receivedAt: true } });
  if (!r) return { ok: false, reason: 'NOT_FOUND' };
  if (r.receivedAt) return { ok: true };
  const upd = await prisma.commandReplacement.updateMany({
    where: { id: r.id, receivedAt: null },
    data: { receivedAt: new Date(), receivedById: user.id, receivedByName: user.name, receivedNote: note?.trim() || null },
  });
  if (upd.count > 0) await audit({ userId: user.id, unitId, action: 'COMMAND_REPLACEMENT_RECEIVED', module: 'COMMANDS', entity: 'command_replacement', entityId: r.id, metadata: { number, note: note?.trim() || null }, ...ctx });
  return { ok: true };
}
