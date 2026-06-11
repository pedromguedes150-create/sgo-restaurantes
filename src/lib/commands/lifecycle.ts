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

/** Reposição de comanda (Admin): entra na sequência ativa. */
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
  await audit({ userId: user.id, unitId, action: 'COMMAND_REPLACEMENT', module: 'COMMANDS', metadata: { number }, ...ctx });
  return { ok: true };
}
