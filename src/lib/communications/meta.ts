import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Integração da Central de Comunicação com a META do gerente.
 * Componente único "Comunicados" com peso configurável (como Treinamentos):
 *  - confirmado no prazo = pontua (done)
 *  - confirmado atrasado = neutro (não entra no denominador)
 *  - vencido sem confirmar = não lido (missed, penaliza)
 */
const WEIGHT_KEY = 'COMMUNICATION_META_WEIGHT';
const DEFAULT_WEIGHT = 10;

export async function getCommunicationWeight(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: WEIGHT_KEY } });
  const n = s ? Number(s.value) : DEFAULT_WEIGHT;
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : DEFAULT_WEIGHT;
}

export async function setCommunicationWeight(user: SessionUser, weight: number) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  const w = Math.max(0, Math.trunc(weight));
  await prisma.appSetting.upsert({ where: { key: WEIGHT_KEY }, create: { key: WEIGHT_KEY, value: String(w) }, update: { value: String(w) } });
  await audit({ userId: user.id, action: 'COMMUNICATION_WEIGHT_SET', module: 'CONFIG', metadata: { weight: w } });
  return { ok: true as const };
}

/** Estatística do mês por unidade: confirmados no prazo (done) e vencidos sem confirmar (missed). */
export async function getCommunicationMonthStats(unitId: string, yearMonth: string): Promise<{ done: number; missed: number }> {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const now = new Date();
  const overdueEnd = new Date(Math.min(end.getTime(), now.getTime())); // no mês e já vencido
  const [done, missed] = await Promise.all([
    prisma.communicationRecipient.count({
      where: { unitId, status: 'CONFIRMED', late: false, communication: { dueAt: { gte: start, lt: end } } },
    }),
    prisma.communicationRecipient.count({
      where: { unitId, status: 'PENDING', communication: { dueAt: { gte: start, lt: overdueEnd } } },
    }),
  ]);
  return { done, missed };
}
