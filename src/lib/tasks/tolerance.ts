import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Tolerância (minutos) para conclusão de checklist ainda contar "no prazo".
 * Ex.: limite 10:00 + tolerância 10 → concluir até 10:10 conta como DONE.
 * Global (AppSetting), configurável pelo Admin. Padrão 10 min.
 */
const KEY = 'CHECKLIST_TOLERANCE_MIN';
const DEFAULT = 10;

export async function getChecklistToleranceMin(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const n = s ? Number(s.value) : DEFAULT;
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : DEFAULT;
}

export async function setChecklistToleranceMin(user: SessionUser, minutes: number, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  const m = Math.max(0, Math.min(180, Math.trunc(Number(minutes) || 0)));
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: String(m) }, update: { value: String(m) } });
  await audit({ userId: user.id, action: 'CHECKLIST_TOLERANCE_SET', module: 'CONFIG', metadata: { minutes: m }, ...ctx });
  return { ok: true as const };
}

/** true se `now` passou do limite + tolerância. */
export function isLate(dueAt: Date, toleranceMin: number, now = new Date()): boolean {
  return now.getTime() > dueAt.getTime() + toleranceMin * 60_000;
}
