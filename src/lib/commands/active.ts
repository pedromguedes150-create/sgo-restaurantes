import { prisma } from '@/lib/db/prisma';

export interface ActiveSequence {
  config: { rangeStart: number; rangeEnd: number } | null;
  active: Set<number>;
  lost: Set<number>;
  replacements: Set<number>;
}

/**
 * Sequência ATIVA de comandas de uma unidade (Módulo 3):
 *   [rangeStart..rangeEnd]  −  baixadas (perdidas)  +  reposições
 * Comandas com baixa definitiva NÃO reaparecem como ausentes.
 */
export async function getActiveSequence(unitId: string): Promise<ActiveSequence> {
  const config = await prisma.unitCommandConfig.findUnique({ where: { unitId } });

  const lostRows = await prisma.commandDivergence.findMany({
    where: { unitId, status: 'CLOSED', outcome: 'LOST' },
    select: { number: true },
  });
  const replRows = await prisma.commandReplacement.findMany({ where: { unitId }, select: { number: true } });

  const lost = new Set(lostRows.map((r) => r.number));
  const replacements = new Set(replRows.map((r) => r.number));

  const active = new Set<number>();
  if (config) {
    for (let n = config.rangeStart; n <= config.rangeEnd; n++) {
      if (!lost.has(n)) active.add(n);
    }
  }
  for (const n of replacements) if (!lost.has(n)) active.add(n);

  return {
    config: config ? { rangeStart: config.rangeStart, rangeEnd: config.rangeEnd } : null,
    active,
    lost,
    replacements,
  };
}
