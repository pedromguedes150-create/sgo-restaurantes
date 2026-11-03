import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Integração da Central de Comunicação com a META do gerente.
 * Componente único "Comunicados" com peso configurável (como Treinamentos):
 *  - confirmado no prazo = pontua (done)
 *  - confirmado atrasado = neutro (não entra no denominador)
 *  - vencido sem confirmar = não lido (missed, penaliza)
 */
/* Peso na meta (v1.180.0): lido por mês e gravado com vigência/motivo em `metas/vigencia.ts`. */
export async function getCommunicationWeight(yearMonth?: string): Promise<number> {
  const { carregarConfigDaMeta } = await import('@/lib/metas/vigencia');
  return (await carregarConfigDaMeta(yearMonth)).peso('COMMUNICATION');
}

export async function setCommunicationWeight(user: SessionUser, weight: number, o: { reason: string; validFrom?: string | null } = { reason: '' }) {
  const { gravarConfigDaMeta } = await import('@/lib/metas/vigencia');
  return gravarConfigDaMeta(user, { key: 'COMMUNICATION_META_WEIGHT', value: weight, validFrom: o.validFrom, reason: o.reason, action: 'COMMUNICATION_WEIGHT_SET' });
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
