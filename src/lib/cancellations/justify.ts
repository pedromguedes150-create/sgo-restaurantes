import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

export type JustifyResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' | 'ALREADY' };

/** Justifica um cancelamento (gerente responsável). Sai da fila e vai p/ histórico. */
export async function justifyCancellation(
  user: SessionUser,
  id: string,
  input: { reasonId: string; note?: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<JustifyResult> {
  const c = await prisma.cancellation.findUnique({ where: { id }, select: { unitId: true, status: true } });
  if (!c) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, c.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (c.status === 'JUSTIFIED') return { ok: false, reason: 'ALREADY' };

  const reason = await prisma.cancellationReason.findUnique({ where: { id: input.reasonId } });
  if (!reason) return { ok: false, reason: 'INVALID' };

  const res = await prisma.cancellation.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'JUSTIFIED', reasonId: reason.id, justificationNote: input.note?.trim() || null, justifiedById: user.id, justifiedAt: new Date() },
  });
  if (res.count === 0) return { ok: false, reason: 'ALREADY' };

  await audit({
    userId: user.id,
    unitId: c.unitId,
    action: 'CANCELLATION_JUSTIFY',
    module: 'CANCELLATIONS',
    entity: 'cancellation',
    entityId: id,
    metadata: { reason: reason.name },
    ...ctx,
  });
  return { ok: true };
}
