import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';

export interface CorrectionItem {
  status: 'EM_CORRECAO' | 'A_CORRIGIR';
  text: string;
  note: string | null;
  checklist: string;
  by: string | null;
  time: string | null;
}
export interface CorrectionsReport {
  unitId: string;
  operationalDate: string;
  emCorrecao: CorrectionItem[];
  aCorrigir: CorrectionItem[];
  total: number;
}

/**
 * Relatório consolidado do dia: itens marcados como "Em correção" (🟡) e
 * "A corrigir" (🔴) nos checklists de uma unidade num dia operacional.
 * O "histórico" é simplesmente escolher outra data.
 */
export async function getCorrectionsReport(user: SessionUser, unitId: string, operationalDate: string): Promise<CorrectionsReport | null> {
  if (!unitId || !canAccessUnit(user, unitId)) return null;
  const rows = await prisma.taskItemResponse.findMany({
    where: { status: { in: ['EM_CORRECAO', 'A_CORRIGIR'] }, instance: { unitId, operationalDate } },
    include: { instance: { include: { template: { select: { name: true } }, completedBy: { select: { name: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
  const map = (r: (typeof rows)[number]): CorrectionItem => ({
    status: r.status as 'EM_CORRECAO' | 'A_CORRIGIR',
    text: r.itemText,
    note: r.note,
    checklist: r.instance.template.name,
    by: r.instance.completedBy?.name ?? null,
    time: r.instance.completedAt ? new Date(r.instance.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null,
  });
  const aCorrigir = rows.filter((r) => r.status === 'A_CORRIGIR').map(map);
  const emCorrecao = rows.filter((r) => r.status === 'EM_CORRECAO').map(map);
  return { unitId, operationalDate, emCorrecao, aCorrigir, total: rows.length };
}
