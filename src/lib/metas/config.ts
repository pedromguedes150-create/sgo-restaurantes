import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Central de configuração da META (16/07, modelo aprovado pelo Pedro):
 * - Módulos DIÁRIOS pontuam por COBERTURA mensal (dias preenchidos ÷ dias do
 *   mês decorridos) — obrigatoriedade diária: não preencheu, o % cai.
 * - Módulos de LANÇAMENTO pontuam invertido — perdem % por correções/edições
 *   da supervisão (penalidade "fora do prazo", já ativa).
 * Pesos novos nascem em 0 (desligados) para não mexer nas notas atuais.
 */
const WASTE_KEY = 'WASTE_META_WEIGHT';
const COMMANDS_KEY = 'COMMANDS_META_WEIGHT';

async function readWeight(key: string, def = 0): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key } });
  const n = s ? Number(s.value) : def;
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : def;
}
async function writeWeight(user: SessionUser, key: string, weight: number, action: string) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  const w = Math.max(0, Math.trunc(weight));
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: String(w) }, update: { value: String(w) } });
  await audit({ userId: user.id, action, module: 'CONFIG', metadata: { weight: w } });
  return { ok: true as const };
}

export const getWasteMetaWeight = () => readWeight(WASTE_KEY);
export const getCommandsMetaWeight = () => readWeight(COMMANDS_KEY);
export const setWasteMetaWeight = (u: SessionUser, w: number) => writeWeight(u, WASTE_KEY, w, 'WASTE_META_WEIGHT_SET');
export const setCommandsMetaWeight = (u: SessionUser, w: number) => writeWeight(u, COMMANDS_KEY, w, 'COMMANDS_META_WEIGHT_SET');

function daysElapsedInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  const now = new Date();
  const isCurrent = now.getFullYear() === y && now.getMonth() + 1 === m;
  if (isCurrent) return Math.max(1, now.getDate() - 1 || 1); // até ontem
  return new Date(y, m, 0).getDate();
}

/** Cobertura diária do mês: done = dias com lançamento, missed = dias sem. */
export async function getWasteCoverage(unitId: string, yearMonth: string): Promise<{ done: number; missed: number }> {
  const done = await prisma.wasteEntry.count({ where: { unitId, operationalDate: { startsWith: yearMonth } } });
  return { done, missed: Math.max(0, daysElapsedInMonth(yearMonth) - done) };
}
export async function getCommandsCoverage(unitId: string, yearMonth: string): Promise<{ done: number; missed: number }> {
  const done = await prisma.commandCount.count({ where: { unitId, operationalDate: { startsWith: yearMonth } } });
  return { done, missed: Math.max(0, daysElapsedInMonth(yearMonth) - done) };
}
