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
  const sequences = await prisma.commandSequence.findMany({ where: { unitId, active: true }, select: { rangeStart: true, rangeEnd: true } });

  const lostRows = await prisma.commandDivergence.findMany({
    where: { unitId, status: 'CLOSED', outcome: 'LOST' },
    select: { number: true },
  });
  const replRows = await prisma.commandReplacement.findMany({ where: { unitId }, select: { number: true } });

  const lost = new Set(lostRows.map((r) => r.number));
  const replacements = new Set(replRows.map((r) => r.number));

  const active = new Set<number>();
  for (const s of sequences) {
    for (let n = s.rangeStart; n <= s.rangeEnd; n++) {
      if (!lost.has(n)) active.add(n);
    }
  }
  for (const n of replacements) if (!lost.has(n)) active.add(n);

  // config = resumo (mín..máx) — usado como "configurado?" e exibição
  const config = sequences.length
    ? { rangeStart: Math.min(...sequences.map((s) => s.rangeStart)), rangeEnd: Math.max(...sequences.map((s) => s.rangeEnd)) }
    : null;

  return { config, active, lost, replacements };
}
