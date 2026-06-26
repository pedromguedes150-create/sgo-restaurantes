import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getActiveSequence } from '@/lib/commands/active';
import type { SessionUser } from '@/lib/auth/session';
import type { DivergenceStatus } from '@prisma/client';

export async function listDivergences(
  user: SessionUser,
  filters: { unitId?: string; status?: DivergenceStatus } = {},
) {
  return prisma.commandDivergence.findMany({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      unit: { active: true }, // ignora unidades inativas/demo
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: { unit: { select: { name: true, code: true } }, reporter: { select: { name: true } } },
    take: 100,
  });
}

/** Nº de divergências em aberto no escopo do usuário (dashboard). */
export async function getOpenDivergenceCount(user: SessionUser): Promise<number> {
  return prisma.commandDivergence.count({
    where: { ...unitScopeWhere(user, 'unitId'), status: { in: ['OPEN', 'INVESTIGATING'] }, unit: { active: true } },
  });
}

/** Estado das comandas de uma unidade para a tela do módulo. */
export async function getUnitCommandState(unitId: string, operationalDate: string) {
  const seq = await getActiveSequence(unitId);
  const [count, open] = await Promise.all([
    prisma.commandCount.findUnique({ where: { unitId_operationalDate: { unitId, operationalDate } } }),
    prisma.commandDivergence.findMany({
      where: { unitId, status: { in: ['OPEN', 'INVESTIGATING'] } },
      orderBy: { number: 'asc' },
      include: { reporter: { select: { name: true } } },
    }),
  ]);
  return {
    config: seq.config,
    activeCount: seq.active.size,
    lostCount: seq.lost.size,
    replacementCount: seq.replacements.size,
    todayCount: count,
    openDivergences: open,
  };
}
