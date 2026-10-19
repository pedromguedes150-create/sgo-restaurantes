import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getUnitMonthScore } from '@/lib/tasks/summary';
import { emLotes, PARALELO_POR_UNIDADE } from '@/lib/async/em-lotes';
import type { SessionUser } from '@/lib/auth/session';

export interface MetaTaskRow {
  name: string;
  weight: number;
  done: number;
  resolved: number; // done + missed
  scorePct: number;
  /** DETALHE = um checklist (informativo, o peso é o de "Checklists do dia"); DESCONTO = tira direto da nota. Sem tipo = componente que pesa. */
  tipo?: 'DETALHE' | 'DESCONTO';
}

/**
 * Detalhamento da meta de uma unidade no mês (v1.174.0): as linhas que PESAM
 * (uma por componente, da mesma lista que dá a nota), as linhas de DETALHE
 * (um checklist por linha, informativas: o peso é o de "Checklists do dia") e
 * as linhas de DESCONTO (fora do prazo, gerente sem folga — direto na nota).
 */
export async function getMetaBreakdown(unitId: string, yearMonth: string): Promise<MetaTaskRow[]> {
  const [{ componentesDaMeta, descontosDaMeta }, { linhasDosComponentes }] = await Promise.all([import('./componentes'), import('./pontuacao')]);
  const [componentes, descontos, instances] = await Promise.all([
    componentesDaMeta(unitId, yearMonth),
    descontosDaMeta(unitId, yearMonth),
    prisma.taskInstance.findMany({
      where: { unitId, operationalDate: { startsWith: yearMonth }, status: { in: ['DONE', 'MISSED'] }, template: { entersMeta: true } },
      select: { status: true, template: { select: { name: true } } },
    }),
  ]);
  const rows: MetaTaskRow[] = linhasDosComponentes(componentes);

  /* Detalhe por checklist: informativo (peso 0, tipo DETALHE) — mostra onde,
     dentro de "Checklists do dia", a unidade perdeu. */
  const porChecklist = new Map<string, { done: number; resolved: number }>();
  for (const i of instances) {
    const cur = porChecklist.get(i.template.name) ?? { done: 0, resolved: 0 };
    cur.resolved++;
    if (i.status === 'DONE') cur.done++;
    porChecklist.set(i.template.name, cur);
  }
  for (const [name, r] of [...porChecklist.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))) {
    rows.push({ name, weight: 0, done: r.done, resolved: r.resolved, scorePct: r.resolved === 0 ? 0 : Math.round((r.done / r.resolved) * 100), tipo: 'DETALHE' });
  }

  /* Descontos diretos na nota (não são peso). */
  const { lateEntry: le, managerLeave: ml } = descontos;
  if (le.count > 0 && le.pct > 0) {
    rows.push({ name: `Fora do prazo (−${Math.round(le.count * le.pct)}% na meta)`, weight: 0, done: 0, resolved: le.count, scorePct: 0, tipo: 'DESCONTO' });
  }
  if (ml.semFolga > 0 && ml.pct > 0) {
    rows.push({
      name: `Escala de gerentes — sem folga cadastrada: ${ml.nomesSemFolga.join(', ')} (−${Math.round(ml.semFolga * ml.pct)}% na meta)`,
      weight: 0, done: ml.gerentes - ml.semFolga, resolved: ml.gerentes, scorePct: 0, tipo: 'DESCONTO',
    });
  }
  return rows;
}

export interface MetaRankingRow {
  unitId: string;
  name: string;
  scorePct: number;
}

/** Ranking mensal de metas por unidade (Admin/CEO/Supervisor). */
export async function getMetaRanking(user: SessionUser, yearMonth: string): Promise<MetaRankingRow[]> {
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' } });
  // unidades em paralelo limitado (v1.158.1) — mesma conta, sem fila
  const out = await emLotes(units, PARALELO_POR_UNIDADE, async (u) => {
    const s = await getUnitMonthScore(u.id, yearMonth);
    return { unitId: u.id, name: u.name, scorePct: s.scorePct };
  });
  return out.sort((a, b) => b.scorePct - a.scorePct);
}
