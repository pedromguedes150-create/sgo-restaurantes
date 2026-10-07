import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import type { Role } from '@prisma/client';
import { sendPushToUsers } from '@/lib/push/send';
import { SUPERVISORY_ROLES } from '@/lib/roles';
import { nivelAoGravar } from '@/lib/notifications/nivel';

export interface NotifyPayload {
  title: string;
  body?: string;
  link?: string;
  module?: string;
  critical?: boolean;
  /**
   * Alerta com toque PRÓPRIO no celular (v1.156.0). Hoje só 'higiene': o
   * service worker usa uma vibração longa e diferente, a notificação fica na
   * tela até ser tocada, e com o SGO aberto toca um som próprio.
   */
  alerta?: 'higiene';
  /** Etiqueta da notificação no aparelho (a mesma etiqueta substitui; outra empilha). */
  tag?: string;
  /**
   * Nível do aviso ao vivo (v1.158.0). Só 'IMPORTANTE' é pedido aqui (som + vibração
   * curta); `critical` continua sendo o CRÍTICO e vence. Sem nada = NORMAL.
   */
  nivel?: 'IMPORTANTE';
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
      data: ids.map((userId) => ({ userId, title: p.title, body: p.body, link: p.link, module: p.module, critical: Boolean(p.critical), level: nivelAoGravar(p) })),
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

/**
 * Notifica a "linha supervisora" — SUPERVISOR + COORDINATOR + ADMIN (regra do Pedro,
 * ver src/lib/roles.ts). Quando `unitId` é informado, SUPERVISOR/COORDINATOR são
 * filtrados pelo vínculo com a unidade (ADMIN não tem vínculo e sempre recebe).
 */
export async function notifySupervisory(p: NotifyPayload, unitId?: string): Promise<void> {
  const or = unitId
    ? [
        { role: 'ADMIN' as Role },
        { role: { in: ['SUPERVISOR', 'COORDINATOR'] as Role[] }, memberships: { some: { unitId } } },
      ]
    : [{ role: { in: SUPERVISORY_ROLES } }];
  const users = await prisma.user.findMany({ where: { active: true, OR: or }, select: { id: true } });
  await notifyUsers(users.map((u) => u.id), p);
}

export async function listNotifications(user: SessionUser, limit = 50) {
  return prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: limit });
}

/**
 * Página de avisos para o menu suspenso da barra (kit de layout, Fase 3):
 * `limit` itens a partir de `cursor` (id do último visto), mais recentes
 * primeiro. Devolve também se há mais e quantos não lidos existem.
 */
export async function listNotificationsPage(user: SessionUser, opts: { limit?: number; cursor?: string | null } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const itens = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const temMais = itens.length > limit;
  const pagina = temMais ? itens.slice(0, limit) : itens;
  const naoLidas = await unreadCount(user);
  return { itens: pagina, proximoCursor: temMais ? pagina[pagina.length - 1].id : null, temMais, naoLidas };
}

/** Só o dono apaga o próprio aviso; id de outro usuário não encontra nada. */
export async function deleteNotification(user: SessionUser, id: string): Promise<boolean> {
  const r = await prisma.notification.deleteMany({ where: { id, userId: user.id } });
  return r.count > 0;
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

/**
 * Avisos NÃO LIDOS do próprio usuário criados depois de `desde` (v1.158.0) — o
 * que o aviso ao vivo no topo da tela pergunta a cada 20s e quando o push chega.
 * Teto de 10: abrir o SGO depois de horas não pode despejar uma fila de toques.
 */
export async function avisosDesde(user: SessionUser, desde: Date) {
  const rows = await prisma.notification.findMany({
    where: { userId: user.id, read: false, createdAt: { gt: desde } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, title: true, body: true, link: true, module: true, critical: true, level: true, createdAt: true },
  });
  return rows.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }));
}
