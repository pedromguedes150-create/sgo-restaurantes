import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { PUSH_CATEGORIES, deviceLabelFromUserAgent } from '@/lib/push/categories';
import { sendPushToUsers, pushConfigured } from '@/lib/push/send';

/** Inscrição vinda do navegador (PushSubscription.toJSON()). */
export interface BrowserSubscription {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export type Result = { ok: true } | { ok: false; detail: string };

/**
 * Registra/atualiza a inscrição deste aparelho. O endpoint é único: se o mesmo
 * aparelho for reinscrito (ou trocar de usuário no mesmo navegador), a linha é
 * reaproveitada apontando para o usuário atual — evita push no dono errado.
 */
export async function subscribeDevice(user: SessionUser, sub: BrowserSubscription, userAgent?: string | null): Promise<Result> {
  const endpoint = String(sub?.endpoint ?? '').trim();
  const p256dh = String(sub?.keys?.p256dh ?? '').trim();
  const auth = String(sub?.keys?.auth ?? '').trim();
  if (!endpoint.startsWith('https://') || !p256dh || !auth) return { ok: false, detail: 'Inscrição inválida' };

  const deviceLabel = deviceLabelFromUserAgent(userAgent);
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh, auth, deviceLabel, userAgent: userAgent ?? null },
    update: { userId: user.id, p256dh, auth, deviceLabel, userAgent: userAgent ?? null, failCount: 0 },
  });
  return { ok: true };
}

/** Remove a inscrição deste aparelho (só do próprio usuário). */
export async function unsubscribeDevice(user: SessionUser, endpoint: string): Promise<Result> {
  if (!endpoint) return { ok: false, detail: 'Aparelho não informado' };
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return { ok: true };
}

/** Remove uma inscrição pelo id (usado na lista "meus aparelhos"). */
export async function removeDeviceById(user: SessionUser, id: string): Promise<Result> {
  const r = await prisma.pushSubscription.deleteMany({ where: { id, userId: user.id } });
  return r.count > 0 ? { ok: true } : { ok: false, detail: 'Aparelho não encontrado' };
}

export interface DeviceRow {
  id: string;
  deviceLabel: string;
  createdAt: Date;
  lastSuccessAt: Date | null;
  endpoint: string;
}

export async function listDevices(user: SessionUser): Promise<DeviceRow[]> {
  const rows = await prisma.pushSubscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, deviceLabel: true, createdAt: true, lastSuccessAt: true, endpoint: true },
  });
  return rows.map((r) => ({ ...r, deviceLabel: r.deviceLabel ?? 'Aparelho' }));
}

/** Preferências do usuário por categoria (ausência de linha = ligado). */
export async function getPreferences(user: SessionUser): Promise<Record<string, boolean>> {
  const rows = await prisma.pushPreference.findMany({ where: { userId: user.id } });
  const map: Record<string, boolean> = {};
  for (const c of PUSH_CATEGORIES) map[c.key] = true;
  for (const r of rows) map[r.category] = r.enabled;
  return map;
}

export async function setPreference(user: SessionUser, category: string, enabled: boolean): Promise<Result> {
  if (!PUSH_CATEGORIES.some((c) => c.key === category)) return { ok: false, detail: 'Categoria desconhecida' };
  await prisma.pushPreference.upsert({
    where: { userId_category: { userId: user.id, category } },
    create: { userId: user.id, category, enabled },
    update: { enabled },
  });
  return { ok: true };
}

/** Envia uma notificação de teste para os aparelhos do próprio usuário. */
export async function sendTestPush(user: SessionUser): Promise<{ ok: boolean; sent: number; detail?: string }> {
  if (!pushConfigured()) return { ok: false, sent: 0, detail: 'Push não configurado no servidor' };
  const sent = await sendPushToUsers([user.id], {
    title: 'SGO Beija Flor',
    body: 'Notificação de teste — está funcionando neste aparelho ✓',
    link: '/notificacoes',
    module: 'GENERAL',
    critical: true, // teste ignora preferência de categoria
  });
  return { ok: sent > 0, sent, detail: sent === 0 ? 'Nenhum aparelho recebeu (ative a notificação neste aparelho)' : undefined };
}
