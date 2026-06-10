import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

export type CompleteResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'EVIDENCE_REQUIRED' | 'ALREADY_DONE' | 'FORBIDDEN' };

/**
 * Conclui uma tarefa de forma TRANSACIONAL (regra nº 8).
 *
 * Dois gerentes da mesma unidade podem tocar a mesma tarefa ao mesmo tempo: o
 * updateMany com guarda `status: PENDING` é atômico no nível da linha, então
 * apenas UM vence; o outro recebe ALREADY_DONE (nada é sobrescrito).
 *
 * Se a tarefa exige evidência, sem `evidencePath` ela não pode ser concluída
 * (e, na meta, só pontua com evidência — conceito transversal nº 6).
 */
export async function completeTask(
  instanceId: string,
  user: SessionUser,
  opts: { evidencePath?: string } = {},
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<CompleteResult> {
  const inst = await prisma.taskInstance.findUnique({
    where: { id: instanceId },
    include: { template: { select: { requiresEvidence: true, name: true } } },
  });
  if (!inst) return { ok: false, reason: 'NOT_FOUND' };

  try {
    assertUnitAccess(user, inst.unitId);
  } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }

  if (inst.template.requiresEvidence && !opts.evidencePath) {
    return { ok: false, reason: 'EVIDENCE_REQUIRED' };
  }

  const res = await prisma.taskInstance.updateMany({
    where: { id: instanceId, status: 'PENDING' },
    data: {
      status: 'DONE',
      completedById: user.id,
      completedAt: new Date(),
      evidencePath: opts.evidencePath ?? null,
    },
  });

  if (res.count === 0) return { ok: false, reason: 'ALREADY_DONE' };

  await audit({
    userId: user.id,
    unitId: inst.unitId,
    action: 'COMPLETE',
    module: 'TASKS',
    entity: 'task_instance',
    entityId: instanceId,
    metadata: { task: inst.template.name, hasEvidence: Boolean(opts.evidencePath) },
    ...ctx,
  });

  return { ok: true };
}
