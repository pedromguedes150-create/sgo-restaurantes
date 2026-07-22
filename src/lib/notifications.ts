import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import type { Role } from '@prisma/client';
import { sendPushToUsers } from '@/lib/push/send';

export interface NotifyPayload {
  title: string;
  body?: string;
  link?: string;
  module?: string;
  critical?: boolean;
}

/**
 * Cria notificações in-app para vários usuários (fonte garantida — conceito nº 4)
 * e dispara o Web Push nos aparelhos inscritos.
 * O push é um CANAL EXTRA: o registro in-app é sempre criado, mesmo que o push
 * falhe ou não esteja configurado (por isso o envio não bloqueia nem propaga erro).
 */
export async function notifyUsers(userIds: string[], p: NotifyPayload): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: ids.map((userId) => ({ userId, title: p.title, body: p.body, link: p.link, module: p.module, critical: Boolean(p.critical) })),
    });
  } catch (err) {
    console.error('[notifications] falha ao criar:', err);
  }
  void sendPushToUsers(ids, p).catch((err) => console.error('[notifications] falha no push:', err));
}

/** Notifica todos os usuários de um perfil (ativos). */
export async function notifyRole(role: Role, p: NotifyPayload): Promise<void> {
  const users = await prisma.user.findMany({ where: { role, active: true }, select: { id: true } });
  await notifyUsers(users.map((u) => u.id), p);
}

/** Notifica todos os administradores (ativos). */
export async function notifyAdmins(p: NotifyPayload): Promise<void> {
  await notifyRole('ADMIN', p);
}

/**
 * Notifica os usuários de um perfil VINCULADOS a uma unidade (ex.: o Supervisor
 * daquela unidade). CEO/ADMIN não têm vínculo — use notifyRole/notifyAdmins.
 */
export async function notifyUnitRole(unitId: string, role: Role, p: NotifyPayload): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role, active: true, memberships: { some: { unitId } } },
    select: { id: true },
  });
  await notifyUsers(users.map((u) => u.id), p);
}

export async function listNotifications(user: SessionUser, limit = 50) {
  return prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: limit });
}

export async function unreadCount(user: SessionUser): Promise<number> {
  return prisma.notification.count({ where: { userId: user.id, read: false } });
}

export async function markRead(user: SessionUser, id: string): Promise<void> {
  await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { read: true } });
}

export async function markAllRead(user: SessionUser): Promise<void> {
  await prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
}
