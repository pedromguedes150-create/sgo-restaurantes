import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { notifySupervisory } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Recorrência de freelancer (pedido de 04/09).
 *
 * O mesmo freelancer chamado três, quatro vezes na semana deixa de ser reforço
 * e vira vínculo — e é o supervisor que precisa ver isso ANTES de aprovar. A
 * contagem é por SEMANA DO DIA DE TRABALHO (segunda→domingo, a mesma semana da
 * consolidação semanal), na rede inteira (o freelancer é o mesmo em qualquer
 * unidade), ignorando rejeitadas. Passou do limite: a solicitação nasce
 * marcada e a supervisão da unidade + Admins recebem aviso crítico. Não
 * bloqueia — como a divergência de valor, é alerta para quem aprova.
 */

const LIMIT_KEY = 'FREELANCER_WEEK_LIMIT';
export const DEFAULT_WEEK_LIMIT = 2;

export async function getFreelancerWeekLimit(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: LIMIT_KEY } });
  const n = s ? Number(s.value) : DEFAULT_WEEK_LIMIT;
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_WEEK_LIMIT;
}

export async function setFreelancerWeekLimit(user: SessionUser, limit: number) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  const n = Math.round(Number(limit));
  if (!Number.isFinite(n) || n < 1 || n > 14) return { ok: false as const, reason: 'INVALID' as const };
  await prisma.appSetting.upsert({ where: { key: LIMIT_KEY }, create: { key: LIMIT_KEY, value: String(n) }, update: { value: String(n) } });
  await audit({ userId: user.id, action: 'FREELANCER_WEEK_LIMIT_SET', module: 'CONFIG', metadata: { limit: n } });
  return { ok: true as const };
}

/** Segunda 00:00Z (inclusive) → segunda seguinte (exclusive) da semana do dia. */
export function semanaDe(dateISO: string): { start: Date; end: Date } {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dia = new Date(Date.UTC(y, m - 1, d));
  const desdeSegunda = (dia.getUTCDay() + 6) % 7; // 0=segunda … 6=domingo
  const start = new Date(dia.getTime() - desdeSegunda * 86400000);
  return { start, end: new Date(start.getTime() + 7 * 86400000) };
}

export interface Recorrencia { weekCount: number; recurrent: boolean; limit: number }

/**
 * Quantas solicitações o freelancer tem na semana do dia, CONTANDO a que está
 * sendo lançada/corrigida (`excludeId` tira a própria quando é correção).
 */
export async function avaliarRecorrencia(freelancerId: string, dateISO: string, excludeId?: string): Promise<Recorrencia> {
  const { start, end } = semanaDe(dateISO);
  const [outras, limit] = await Promise.all([
    prisma.paymentRequest.count({
      where: {
        freelancerId, type: 'FREELANCER', status: { not: 'REJECTED' },
        workDate: { gte: start, lt: end },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    }),
    getFreelancerWeekLimit(),
  ]);
  const weekCount = outras + 1;
  return { weekCount, recurrent: weekCount > limit, limit };
}

/** Aviso crítico à supervisão da unidade e aos Admins. */
export async function avisarRecorrencia(unitId: string, freelancerId: string, rec: Recorrencia, dateISO: string): Promise<void> {
  const f = await prisma.freelancer.findUnique({ where: { id: freelancerId }, select: { name: true } });
  const { start } = semanaDe(dateISO);
  const seg = `${String(start.getUTCDate()).padStart(2, '0')}/${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
  await notifySupervisory({
    title: '⚠ Freelancer recorrente na semana',
    body: `${f?.name ?? 'Freelancer'} já tem ${rec.weekCount} solicitações na semana de ${seg} (limite ${rec.limit}). Confira antes de aprovar.`,
    link: '/modulos/pagamentos',
    module: 'PAYMENTS',
    critical: true,
  }, unitId).catch(() => {});
}
