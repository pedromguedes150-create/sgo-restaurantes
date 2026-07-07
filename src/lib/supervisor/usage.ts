import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getUnitMonthScore } from '@/lib/tasks/summary';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Rotina do Supervisor — Fase A: painel de uso/aderência dos gerentes.
 * Consolida, por unidade/mês: % de checklists, cobertura de desperdício e
 * comandas (lançamentos ÷ dias decorridos), ocorrências, notas e meta,
 * com um indicador de "uso correto" (quem está deixando de usar o sistema).
 */

export interface UnitUsageRow {
  unitId: string;
  unitName: string;
  checklistPct: number; // % concluído no mês (DONE ÷ resolvidas)
  wastePct: number; // dias com lançamento ÷ dias decorridos
  commandsPct: number; // idem
  occurrences: number; // nº no mês
  notes: number; // nº no mês
  cashSessions: number; // caixas no mês (módulo Troco)
  metaPct: number; // score da meta
  usagePct: number; // média dos indicadores de uso diário (checklist/waste/commands)
  tone: 'success' | 'medium' | 'critical';
}

function daysElapsed(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  const now = new Date();
  const isCurrent = now.getFullYear() === y && now.getMonth() + 1 === m;
  if (isCurrent) return Math.max(1, now.getDate() - 1 || 1); // até ontem (dia atual pode ainda não ter lançamento)
  return new Date(y, m, 0).getDate(); // mês fechado = todos os dias
}

export async function getUsageBoard(user: SessionUser, yearMonth: string): Promise<UnitUsageRow[]> {
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  const ids = units.map((u) => u.id);
  const elapsed = daysElapsed(yearMonth);

  const [tasks, waste, commands, occurrences, notes, cash] = await Promise.all([
    prisma.taskInstance.groupBy({
      by: ['unitId', 'status'],
      where: { unitId: { in: ids }, operationalDate: { startsWith: yearMonth }, status: { in: ['DONE', 'MISSED'] } },
      _count: true,
    }),
    prisma.wasteEntry.groupBy({ by: ['unitId'], where: { unitId: { in: ids }, operationalDate: { startsWith: yearMonth } }, _count: true }),
    prisma.commandCount.groupBy({ by: ['unitId'], where: { unitId: { in: ids }, operationalDate: { startsWith: yearMonth } }, _count: true }),
    prisma.occurrence.groupBy({ by: ['unitId'], where: { unitId: { in: ids }, operationalDate: { startsWith: yearMonth } }, _count: true }),
    prisma.receivedNote.groupBy({
      by: ['unitId'],
      where: { unitId: { in: ids }, createdAt: { gte: new Date(`${yearMonth}-01T00:00:00Z`), lt: nextMonthStart(yearMonth) } },
      _count: true,
    }),
    prisma.cashSession.groupBy({ by: ['unitId'], where: { unitId: { in: ids }, operationalDate: { startsWith: yearMonth } }, _count: true }),
  ]);

  const countBy = (list: { unitId: string; _count: number }[]) => new Map(list.map((r) => [r.unitId, r._count]));
  const wasteBy = countBy(waste);
  const commandsBy = countBy(commands);
  const occBy = countBy(occurrences);
  const notesBy = countBy(notes);
  const cashBy = countBy(cash);

  const rows: UnitUsageRow[] = [];
  for (const u of units) {
    const done = tasks.find((t) => t.unitId === u.id && t.status === 'DONE')?._count ?? 0;
    const missed = tasks.find((t) => t.unitId === u.id && t.status === 'MISSED')?._count ?? 0;
    const resolved = done + missed;
    const checklistPct = resolved === 0 ? 0 : Math.round((done / resolved) * 100);
    const wastePct = Math.min(100, Math.round(((wasteBy.get(u.id) ?? 0) / elapsed) * 100));
    const commandsPct = Math.min(100, Math.round(((commandsBy.get(u.id) ?? 0) / elapsed) * 100));
    const meta = await getUnitMonthScore(u.id, yearMonth);
    const usagePct = Math.round((checklistPct + wastePct + commandsPct) / 3);
    rows.push({
      unitId: u.id, unitName: u.name,
      checklistPct, wastePct, commandsPct,
      occurrences: occBy.get(u.id) ?? 0, notes: notesBy.get(u.id) ?? 0, cashSessions: cashBy.get(u.id) ?? 0,
      metaPct: meta.scorePct, usagePct,
      tone: usagePct >= 80 ? 'success' : usagePct >= 50 ? 'medium' : 'critical',
    });
  }
  return rows.sort((a, b) => a.usagePct - b.usagePct); // piores primeiro (quem precisa de atenção)
}

function nextMonthStart(yearMonth: string): Date {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1));
}
