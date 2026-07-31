import { prisma } from '@/lib/db/prisma';
import { canEditModule } from '@/lib/permissions';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SubmissionAnswer } from '@/lib/checklist-forms/types';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';

export interface SubmissionRow {
  id: string;
  templateId: string;
  formTitle: string;
  unitName: string;
  respondentName: string;
  createdAt: string;
  answers: SubmissionAnswer[];
}

/**
 * Envios das fichas por link no escopo do usuário (histórico). Só quem tem
 * CHECKLIST_FORMS; escopo por unidade sempre no servidor. Null = sem permissão.
 */
export async function listChecklistSubmissions(user: SessionUser, opts: { templateId?: string; days?: number } = {}): Promise<SubmissionRow[] | null> {
  if (!(await canEditModule(user.role, 'CHECKLIST_FORMS'))) return null;
  const days = opts.days && opts.days > 0 ? opts.days : 30;
  const since = new Date(Date.now() - days * 86400000);
  const where: Prisma.ChecklistSubmissionWhereInput = { createdAt: { gte: since }, ...unitScopeWhere(user, 'unitId') };
  if (opts.templateId) where.templateId = opts.templateId;

  const rows = await prisma.checklistSubmission.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { template: { select: { name: true, unit: { select: { name: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    templateId: r.templateId,
    formTitle: r.template.name,
    unitName: r.template.unit.name,
    respondentName: r.respondentName,
    createdAt: r.createdAt.toISOString(),
    answers: Array.isArray(r.answers) ? (r.answers as unknown as SubmissionAnswer[]) : [],
  }));
}
