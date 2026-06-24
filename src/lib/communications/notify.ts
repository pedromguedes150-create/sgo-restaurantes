import { prisma } from '@/lib/db/prisma';
import { notifyUsers } from '@/lib/notifications';
import { audit } from '@/lib/audit';
import { getCommunication } from '@/lib/communications/query';
import type { SessionUser } from '@/lib/auth/session';

const TITLE = '⏰ Comunicado a confirmar';

export type RemindResult = { ok: true; reminded: number } | { ok: false; reason: 'FORBIDDEN' | 'NOT_FOUND' };

/** Reenvia (cobra) a confirmação para quem ainda está pendente. Autor/supervisão/admin. */
export async function remindPendingCommunication(user: SessionUser, id: string, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<RemindResult> {
  const data = await getCommunication(user, id);
  if (!data) return { ok: false, reason: 'NOT_FOUND' };
  if (!data.canManage) return { ok: false, reason: 'FORBIDDEN' };
  const pendingIds = data.comm.recipients.filter((r) => r.status === 'PENDING').map((r) => r.userId);
  if (pendingIds.length > 0) {
    await notifyUsers(pendingIds, {
      title: '📣 Cobrança: confirme o comunicado',
      body: `"${data.comm.title}" — ${user.name} está aguardando sua confirmação.`,
      link: `/modulos/comunicacao/${id}`,
      module: 'COMMUNICATION',
      critical: true,
    });
  }
  await audit({ userId: user.id, action: 'COMMUNICATION_REMIND', module: 'COMMUNICATION', entity: 'communication', entityId: id, metadata: { reminded: pendingIds.length }, ...ctx });
  return { ok: true, reminded: pendingIds.length };
}

/**
 * Lembra quem ainda NÃO confirmou um comunicado cujo prazo está próximo
 * (≤24h) ou recém-vencido (até 7 dias atrás). Idempotente: dedup por
 * (userId, link, title) — envia no máx. um lembrete por destinatário/comunicado.
 * Roda no scheduler (~1×/dia basta; seguro rodar de hora em hora).
 */
export async function notifyDueSoonCommunications(now: Date = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const floor = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const pend = await prisma.communicationRecipient.findMany({
    where: { status: 'PENDING', communication: { dueAt: { lte: soon, gte: floor } } },
    include: { communication: { select: { id: true, title: true, dueAt: true } } },
  });

  let sent = 0;
  for (const r of pend) {
    const link = `/modulos/comunicacao/${r.communicationId}`;
    const already = await prisma.notification.findFirst({ where: { userId: r.userId, link, title: TITLE }, select: { id: true } });
    if (already) continue;
    const overdue = r.communication.dueAt < now;
    await notifyUsers([r.userId], {
      title: TITLE,
      body: `"${r.communication.title}" ${overdue ? 'está vencido e ainda não foi confirmado.' : 'vence em breve — confirme a leitura.'}`,
      link,
      module: 'COMMUNICATION',
      critical: overdue,
    });
    sent++;
  }
  return sent;
}
