import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';

export interface CorrectionItem {
  status: 'EM_CORRECAO' | 'A_CORRIGIR';
  text: string;
  note: string | null;
  checklist: string;
  unit: string;
  operationalDate: string;
  by: string | null;
  time: string | null;
}
export interface CorrectionsReport {
  emCorrecao: CorrectionItem[];
  aCorrigir: CorrectionItem[];
  total: number;
}

/**
 * Relatório consolidado: itens "Em correção" (🟡) e "A corrigir" (🔴) nos
 * checklists de UMA OU VÁRIAS unidades, num PERÍODO (from→to, dias operacionais).
 * Cada item carrega a unidade e a data para agrupamento na tela.
 */
export async function getCorrectionsReport(user: SessionUser, unitIds: string[], from: string, to: string): Promise<CorrectionsReport> {
  const ids = unitIds.filter((id) => canAccessUnit(user, id));
  if (ids.length === 0) return { emCorrecao: [], aCorrigir: [], total: 0 };
  const [lo, hi] = from <= to ? [from, to] : [to, from];

  const rows = await prisma.taskItemResponse.findMany({
    where: {
      status: { in: ['EM_CORRECAO', 'A_CORRIGIR'] },
      instance: { unitId: { in: ids }, operationalDate: { gte: lo, lte: hi } },
    },
    include: { instance: { include: { template: { select: { name: true } }, unit: { select: { name: true } }, completedBy: { select: { name: true } } } } },
    orderBy: [{ instance: { operationalDate: 'desc' } }, { createdAt: 'asc' }],
  });
  const map = (r: (typeof rows)[number]): CorrectionItem => ({
    status: r.status as 'EM_CORRECAO' | 'A_CORRIGIR',
    text: r.itemText,
    note: r.note,
    checklist: r.instance.template.name,
    unit: r.instance.unit.name,
    operationalDate: r.instance.operationalDate,
    by: r.instance.completedBy?.name ?? null,
    time: r.instance.completedAt ? new Date(r.instance.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null,
  });
  const aCorrigir = rows.filter((r) => r.status === 'A_CORRIGIR').map(map);
  const emCorrecao = rows.filter((r) => r.status === 'EM_CORRECAO').map(map);
  return { emCorrecao, aCorrigir, total: rows.length };
}
