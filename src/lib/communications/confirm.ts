import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

export type ConfirmResult =
  | { ok: true; late: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY' | 'RESPONSE_REQUIRED' };

type Ctx = { ip?: string | null; userAgent?: string | null };

/** O gerente confirma a leitura do comunicado (com resposta opcional/obrigatória). */
export async function confirmCommunication(
  user: SessionUser,
  communicationId: string,
  opts: { responseNote?: string; responsePath?: string } = {},
  ctx: Ctx = {},
): Promise<ConfirmResult> {
  const rec = await prisma.communicationRecipient.findUnique({
    where: { communicationId_userId: { communicationId, userId: user.id } },
    include: { communication: { select: { requiresResponse: true, dueAt: true, title: true } } },
  });
  if (!rec) return { ok: false, reason: 'NOT_FOUND' };
  if (rec.status === 'CONFIRMED') return { ok: false, reason: 'ALREADY' };
  if (rec.communication.requiresResponse && !opts.responsePath && !opts.responseNote?.trim()) {
    return { ok: false, reason: 'RESPONSE_REQUIRED' };
  }

  const now = new Date();
  const late = now > rec.communication.dueAt;
  await prisma.communicationRecipient.update({
    where: { id: rec.id },
    data: { status: 'CONFIRMED', confirmedAt: now, late, responseNote: opts.responseNote?.trim() || null, responsePath: opts.responsePath || null },
  });
  await audit({ userId: user.id, unitId: rec.unitId ?? undefined, action: late ? 'COMMUNICATION_CONFIRM_LATE' : 'COMMUNICATION_CONFIRM', module: 'COMMUNICATION', entity: 'communication', entityId: communicationId, metadata: { late, withResponse: Boolean(opts.responsePath || opts.responseNote) }, ...ctx });
  return { ok: true, late };
}
