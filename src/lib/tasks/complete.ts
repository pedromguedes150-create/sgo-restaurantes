import { prisma } from '@/lib/db/prisma';
import type { ItemStatus } from '@prisma/client';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { getChecklistToleranceMin, isLate } from '@/lib/tasks/tolerance';
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

  // Fora do prazo (+ tolerância): conclui como LATE (neutro na meta, não penaliza).
  const late = isLate(inst.dueAt, await getChecklistToleranceMin());
  const res = await prisma.taskInstance.updateMany({
    where: { id: instanceId, status: { in: ['PENDING', 'MISSED'] } },
    data: {
      status: late ? 'LATE' : 'DONE',
      completedById: user.id,
      completedAt: new Date(),
      evidencePath: opts.evidencePath ?? null,
    },
  });

  if (res.count === 0) return { ok: false, reason: 'ALREADY_DONE' };

  await audit({
    userId: user.id,
    unitId: inst.unitId,
    action: late ? 'COMPLETE_LATE' : 'COMPLETE',
    module: 'TASKS',
    entity: 'task_instance',
    entityId: instanceId,
    metadata: { task: inst.template.name, hasEvidence: Boolean(opts.evidencePath), late },
    ...ctx,
  });

  return { ok: true };
}

export interface ItemAnswer { itemId: string; itemText: string; status: ItemStatus; note?: string }

/**
 * Conclui um checklist ESTRUTURADO: respostas dos itens + fotos (até 5).
 * - Fora do prazo → status LATE (neutro). Dentro → DONE.
 * - Cada item "A corrigir" gera uma OCORRÊNCIA automática (não bloqueia se falhar).
 */
export interface ChecklistPhoto { path: string; itemId: string | null }

export async function completeChecklist(
  instanceId: string,
  user: SessionUser,
  data: { items: ItemAnswer[]; photos: ChecklistPhoto[]; evidencePath?: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<CompleteResult> {
  const inst = await prisma.taskInstance.findUnique({
    where: { id: instanceId },
    include: { template: { select: { requiresEvidence: true, name: true } }, unit: { select: { timezone: true, cutoffHour: true } } },
  });
  if (!inst) return { ok: false, reason: 'NOT_FOUND' };
  try { assertUnitAccess(user, inst.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  // Checklist individual: só o gerente dono (ou admin) conclui.
  if (inst.assignedToId && inst.assignedToId !== user.id && user.role !== 'ADMIN') {
    return { ok: false, reason: 'FORBIDDEN' };
  }
  const allPhotos: ChecklistPhoto[] = [...(data.evidencePath ? [{ path: data.evidencePath, itemId: null }] : []), ...data.photos].slice(0, 5);
  if (inst.template.requiresEvidence && allPhotos.length === 0) {
    return { ok: false, reason: 'EVIDENCE_REQUIRED' };
  }

  const late = isLate(inst.dueAt, await getChecklistToleranceMin());
  const res = await prisma.taskInstance.updateMany({
    where: { id: instanceId, status: { in: ['PENDING', 'MISSED'] } },
    data: { status: late ? 'LATE' : 'DONE', completedById: user.id, completedAt: new Date(), evidencePath: allPhotos[0]?.path ?? null, draft: undefined },
  });
  if (res.count === 0) return { ok: false, reason: 'ALREADY_DONE' };

  // Respostas e fotos (idempotente: substitui)
  await prisma.$transaction(async (tx) => {
    await tx.taskItemResponse.deleteMany({ where: { instanceId } });
    if (data.items.length) {
      await tx.taskItemResponse.createMany({ data: data.items.map((i) => ({ instanceId, itemId: i.itemId, itemText: i.itemText, status: i.status, note: i.note?.trim() || null })) });
    }
    await tx.taskPhoto.deleteMany({ where: { instanceId } });
    if (allPhotos.length) {
      await tx.taskPhoto.createMany({ data: allPhotos.map((p) => ({ instanceId, path: p.path, itemId: p.itemId })) });
    }
  });

  /**
   * A ocorrência NÃO nasce mais sozinha aqui.
   *
   * Até a v1.78.1, todo item marcado "A corrigir" virava ocorrência — e a aba
   * de Ocorrências enchia de rotina de checklist, misturada com o que
   * realmente precisava de outro setor. Checklist é acompanhamento da rotina;
   * ocorrência é problema que pede ação. Agora quem abre é o usuário, pelo
   * botão ao lado do item, e a ocorrência nasce com categoria, criticidade e
   * destino escolhidos — coisas que o automático tinha de inventar.
   *
   * O contador continua no log: é ele que mostra se a mudança reduziu mesmo o
   * ruído, comparando "quantos itens a corrigir" com "quantas ocorrências
   * abertas".
   */
  const toFix = data.items.filter((i) => i.status === 'A_CORRIGIR');
  const naoRealizados = data.items.filter((i) => i.status === 'NAO_REALIZADO');

  await audit({ userId: user.id, unitId: inst.unitId, action: late ? 'COMPLETE_LATE' : 'COMPLETE', module: 'TASKS', entity: 'task_instance', entityId: instanceId, metadata: { task: inst.template.name, items: data.items.length, photos: allPhotos.length, toFix: toFix.length, naoRealizados: naoRealizados.length, late }, ...ctx });
  return { ok: true };
}
