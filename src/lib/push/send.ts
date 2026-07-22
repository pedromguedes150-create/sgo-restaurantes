import webpush from 'web-push';
import { prisma } from '@/lib/db/prisma';
import { categoryOfModule } from '@/lib/push/categories';

/**
 * Envio de Web Push (VAPID). Inerte sem as chaves no .env — o sistema segue
 * funcionando só com a Central de Notificações (in-app), como antes.
 * Chaves: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (mailto:).
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:ti@grupobeijaflor.com.br';

/** Nº de falhas seguidas antes de descartar a inscrição (aparelho sumiu). */
const MAX_FAILS = 5;

let configured = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  } catch (err) {
    console.error('[push] chaves VAPID inválidas — push desativado:', err);
  }
}

export function pushConfigured(): boolean {
  return configured;
}

/** Chave pública (vai para o navegador na hora de inscrever). */
export function pushPublicKey(): string {
  return configured ? PUBLIC_KEY : '';
}

export interface PushPayload {
  title: string;
  body?: string;
  link?: string;
  module?: string;
  critical?: boolean;
}

/** Corta o texto para caber no limite de payload do serviço de push (~4KB). */
function trim(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * Dispara push para os aparelhos inscritos dos usuários informados.
 * Respeita a preferência por categoria (críticas passam sempre) e limpa
 * inscrições mortas (404/410 = navegador descartou).
 */
export async function sendPushToUsers(userIds: string[], p: PushPayload): Promise<number> {
  if (!configured) return 0;
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return 0;

  const category = categoryOfModule(p.module);

  const [subs, prefs] = await Promise.all([
    prisma.pushSubscription.findMany({ where: { userId: { in: ids } } }),
    p.critical
      ? Promise.resolve([])
      : prisma.pushPreference.findMany({ where: { userId: { in: ids }, category, enabled: false }, select: { userId: true } }),
  ]);
  if (subs.length === 0) return 0;

  const muted = new Set(prefs.map((x) => x.userId));
  const targets = subs.filter((s) => !muted.has(s.userId));
  if (targets.length === 0) return 0;

  const payload = JSON.stringify({
    title: trim(p.title, 120),
    body: trim(p.body, 300),
    link: p.link ?? '/notificacoes',
    tag: p.module ? `sgo-${p.module.toLowerCase()}` : undefined,
    critical: Boolean(p.critical),
    at: Date.now(),
  });

  const dead: string[] = [];
  const failed: string[] = [];
  const ok: string[] = [];

  await Promise.all(
    targets.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: p.critical ? 86400 : 21600, urgency: p.critical ? 'high' : 'normal' },
        );
        ok.push(s.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.id);
        else {
          failed.push(s.id);
          console.error('[push] falha no envio', status ?? err);
        }
      }
    }),
  );

  try {
    if (ok.length) await prisma.pushSubscription.updateMany({ where: { id: { in: ok } }, data: { lastSuccessAt: new Date(), failCount: 0 } });
    if (dead.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
    if (failed.length) {
      await prisma.pushSubscription.updateMany({ where: { id: { in: failed } }, data: { failCount: { increment: 1 } } });
      await prisma.pushSubscription.deleteMany({ where: { id: { in: failed }, failCount: { gte: MAX_FAILS } } });
    }
  } catch (err) {
    console.error('[push] falha ao atualizar inscrições:', err);
  }

  return ok.length;
}
