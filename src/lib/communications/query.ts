import { prisma } from '@/lib/db/prisma';
import { canAuthorCommunications } from '@/lib/communications/create';
import type { SessionUser } from '@/lib/auth/session';

const COMM_INCLUDE = {
  author: { select: { name: true } },
  attachments: true,
  units: { include: { unit: { select: { id: true, name: true } } } },
};

/** Caixa de entrada do gerente: comunicados que ele precisa/confirmou. */
export async function getMyInbox(user: SessionUser) {
  return prisma.communicationRecipient.findMany({
    where: { userId: user.id },
    include: { communication: { include: COMM_INCLUDE } },
    orderBy: [{ communication: { pinned: 'desc' } }, { communication: { dueAt: 'asc' } }],
    take: 200,
  });
}

export async function getInboxPendingCount(user: SessionUser): Promise<number> {
  return prisma.communicationRecipient.count({ where: { userId: user.id, status: 'PENDING' } });
}

export interface InterstitialComm {
  id: string; title: string; body: string; priority: string; pinned: boolean; requiresResponse: boolean;
  authorName: string; createdAt: string;
  attachments: { path: string; name: string; isImage: boolean }[];
}

/**
 * Comunicados PENDENTES do usuário para exibir em tela cheia ao abrir o app
 * (20/07): urgentes/fixados primeiro. O gerente confirma ali mesmo.
 */
export async function getPendingInterstitials(user: SessionUser): Promise<InterstitialComm[]> {
  const PRIO: Record<string, number> = { URGENT: 0, IMPORTANT: 1, NORMAL: 2 };
  const rows = await prisma.communicationRecipient.findMany({
    where: { userId: user.id, status: 'PENDING' },
    include: { communication: { include: { author: { select: { name: true } }, attachments: true } } },
    take: 20,
  });
  return rows
    .map((r) => r.communication)
    .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || ((PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9)) || (a.dueAt.getTime() - b.dueAt.getTime()))
    .map((c) => ({
      id: c.id, title: c.title, body: c.body, priority: c.priority, pinned: c.pinned, requiresResponse: c.requiresResponse,
      authorName: c.author?.name ?? '—', createdAt: c.createdAt.toISOString(),
      attachments: (c.attachments ?? []).map((a) => {
        const path = (a as { path?: string; url?: string }).path ?? (a as { url?: string }).url ?? '';
        const name = (a as { name?: string; fileName?: string }).name ?? (a as { fileName?: string }).fileName ?? 'anexo';
        return { path, name, isImage: /\.(png|jpe?g|gif|webp)$/i.test(path) };
      }).filter((a) => a.path),
    }));
}

/** Painel do autor/supervisão: comunicados que pode acompanhar, com contagens. */
export async function getAuthoredCommunications(user: SessionUser) {
  const where = user.seesAllUnits
    ? {}
    : { OR: [{ authorId: user.id }, { units: { some: { unitId: { in: user.unitIds } } } }] };
  const rows = await prisma.communication.findMany({
    where,
    include: { ...COMM_INCLUDE, recipients: { select: { status: true } } },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });
  return rows.map((c) => {
    const total = c.recipients.length;
    const confirmed = c.recipients.filter((r) => r.status === 'CONFIRMED').length;
    return { ...c, total, confirmed, pending: total - confirmed };
  });
}

/** Detalhe com painel de confirmações. Controla acesso. */
export async function getCommunication(user: SessionUser, id: string) {
  const comm = await prisma.communication.findUnique({
    where: { id },
    include: {
      ...COMM_INCLUDE,
      recipients: {
        include: { user: { select: { id: true, name: true, role: true } }, unit: { select: { name: true } } },
        orderBy: [{ status: 'asc' }, { user: { name: 'asc' } }],
      },
    },
  });
  if (!comm) return null;

  const myRecipient = comm.recipients.find((r) => r.userId === user.id) ?? null;
  const isAuthor = comm.authorId === user.id;
  const targetUnitIds = comm.units.map((u) => u.unitId);
  const inScope = user.seesAllUnits || targetUnitIds.some((u) => user.unitIds.includes(u));
  const canManage = isAuthor || (canAuthorCommunications(user) && inScope) || user.seesAllUnits;

  if (!myRecipient && !canManage) return null;
  return { comm, myRecipient, canManage };
}
