import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

export type CloseResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' | 'ALREADY_CLOSED' };

/** Marca a ocorrência como "Em andamento" (Supervisor/Admin/CEO). */
export async function markInProgress(
  user: SessionUser,
  id: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<CloseResult> {
  if (user.role !== 'SUPERVISOR' && user.role !== 'ADMIN' && user.role !== 'CEO') {
    return { ok: false, reason: 'FORBIDDEN' };
  }
  const occ = await prisma.occurrence.findUnique({ where: { id }, select: { unitId: true, status: true, number: true } });
  if (!occ) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, occ.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (occ.status === 'CLOSED') return { ok: false, reason: 'ALREADY_CLOSED' };

  const res = await prisma.occurrence.updateMany({
    where: { id, status: 'OPEN' },
    data: { status: 'IN_PROGRESS' },
  });
  if (res.count === 0) return { ok: false, reason: 'ALREADY_CLOSED' };

  await audit({ userId: user.id, unitId: occ.unitId, action: 'OCC_IN_PROGRESS', module: 'OCCURRENCES', entity: 'occurrence', entityId: id, metadata: { number: occ.number }, ...ctx });
  return { ok: true };
}

/**
 * Encerra uma ocorrência (Módulo 6). Somente Supervisor/Admin.
 * Exige justificativa + ação corretiva + data de revisão. Vira registro imutável.
 */
export async function closeOccurrence(
  user: SessionUser,
  id: string,
  input: { justification: string; correctiveAction: string; reviewDate: Date },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<CloseResult> {
  if (user.role !== 'SUPERVISOR' && user.role !== 'ADMIN' && user.role !== 'CEO') {
    return { ok: false, reason: 'FORBIDDEN' };
  }
  if (!input.justification?.trim() || !input.correctiveAction?.trim() || !input.reviewDate) {
    return { ok: false, reason: 'INVALID' };
  }

  const occ = await prisma.occurrence.findUnique({ where: { id }, select: { unitId: true, status: true, number: true } });
  if (!occ) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, occ.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (occ.status === 'CLOSED') return { ok: false, reason: 'ALREADY_CLOSED' };

  // guarda transacional: só encerra se ainda não estiver encerrada
  const res = await prisma.occurrence.updateMany({
    where: { id, status: { not: 'CLOSED' } },
    data: {
      status: 'CLOSED',
      closedById: user.id,
      closedAt: new Date(),
      closureJustification: input.justification.trim(),
      correctiveAction: input.correctiveAction.trim(),
      reviewDate: input.reviewDate,
    },
  });
  if (res.count === 0) return { ok: false, reason: 'ALREADY_CLOSED' };

  await audit({
    userId: user.id,
    unitId: occ.unitId,
    action: 'OCC_CLOSE',
    module: 'OCCURRENCES',
    entity: 'occurrence',
    entityId: id,
    metadata: { number: occ.number, reviewDate: input.reviewDate.toISOString() },
    ...ctx,
  });

  return { ok: true };
}
