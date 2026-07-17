import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import type { NoteStatus } from '@prisma/client';

/**
 * Notas do período (16/07): padrão = últimos 60 dias; período maior via
 * sinceDays. Sempre por data de lançamento, mais nova primeiro.
 */
export async function listNotes(user: SessionUser, status?: NoteStatus, sinceDays = 60) {
  const since = new Date(Date.now() - Math.max(1, sinceDays) * 24 * 60 * 60 * 1000);
  return prisma.receivedNote.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(status ? { status } : {}), createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { unit: { select: { name: true } }, createdBy: { select: { name: true } } },
  });
}

export interface NoteSummary {
  received: number;
  paid: number;
  problem: number;
  monthValue: number;
}

export async function getNoteSummary(user: SessionUser, yearMonth: string): Promise<NoteSummary> {
  const scope = unitScopeWhere(user, 'unitId');
  const rows = await prisma.receivedNote.findMany({
    where: { ...scope },
    select: { status: true, totalValue: true, createdAt: true },
  });
  let received = 0, paid = 0, problem = 0, monthValue = 0;
  for (const r of rows) {
    if (r.status === 'RECEIVED') received++;
    else if (r.status === 'PAID') paid++;
    else problem++;
    if (r.createdAt.toISOString().slice(0, 7) === yearMonth) monthValue += Number(r.totalValue);
  }
  return { received, paid, problem, monthValue: Math.round(monthValue * 100) / 100 };
}
