import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { notifyUsers } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { CommunicationPriority } from '@prisma/client';
import type { CommLink } from '@/lib/communications/create';

type Ctx = { ip?: string | null; userAgent?: string | null };

export interface UpdateCommunicationInput {
  title?: string;
  body?: string;
  priority?: CommunicationPriority;
  requiresResponse?: boolean;
  pinned?: boolean;
  dueAt?: string;
  links?: CommLink[];
  unitIds?: string[];
  extraUserIds?: string[];
  /** false/omitido = calcula prévia; true = aplica de fato (após o autor confirmar). */
  confirm?: boolean;
}

export interface UpdateSummary {
  added: number;
  removed: number;
  kept: number;
  /** confirmações que permanecem e serão zeradas porque o TEXTO mudou */
  resetOks: number;
  /** confirmações perdidas por remoção do destinatário */
  removedConfirmed: number;
  textChanged: boolean;
}

export type UpdateResult =
  | { ok: true; applied: true; summary: UpdateSummary }
  | { ok: true; applied: false; needsConfirm: true; summary: UpdateSummary }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' | 'NO_RECIPIENTS' };

/** Resolve o público-alvo (mesma regra do create): gerentes das unidades + avulsos. */
async function resolveTargets(user: SessionUser, unitIds: string[], extraUserIds: string[]): Promise<Map<string, string | null>> {
  const recip = new Map<string, string | null>();
  if (unitIds.length) {
    const managers = await prisma.user.findMany({
      where: { role: 'MANAGER', active: true, memberships: { some: { unitId: { in: unitIds } } } },
      select: { id: true, memberships: { where: { unitId: { in: unitIds } }, select: { unitId: true } } },
    });
    for (const m of managers) recip.set(m.id, m.memberships[0]?.unitId ?? null);
  }
  const extras = [...new Set(extraUserIds.filter(Boolean))];
  if (extras.length) {
    const rows = await prisma.user.findMany({ where: { id: { in: extras }, active: true }, select: { id: true, memberships: { select: { unitId: true } } } });
    for (const e of rows) if (!recip.has(e.id)) recip.set(e.id, e.memberships[0]?.unitId ?? null);
  }
  return recip;
}

/**
 * Edita um comunicado. APENAS o autor (checado no servidor). Regras:
 *  - Texto (título/mensagem) muda + havia confirmações → zera TODOS os OKs atuais.
 *  - Metadados (prioridade, prazo, links, exigir-resposta, fixado) NÃO zeram.
 *  - Destinatários reconciliados: removidos são apagados (some da meta), novos entram
 *    PENDING (notificados), os que permanecem mantêm o OK (salvo reset por texto).
 *  - Se a operação destrói confirmações e `confirm !== true`, devolve prévia (não aplica).
 */
export async function updateCommunication(user: SessionUser, id: string, input: UpdateCommunicationInput, ctx: Ctx = {}): Promise<UpdateResult> {
  const comm = await prisma.communication.findUnique({
    where: { id },
    include: { recipients: { select: { userId: true, status: true } }, units: { select: { unitId: true } } },
  });
  if (!comm) return { ok: false, reason: 'NOT_FOUND' };
  if (comm.authorId !== user.id) return { ok: false, reason: 'FORBIDDEN' }; // só o autor edita

  // Campos de conteúdo (fallback ao atual quando ausente).
  const title = (input.title ?? comm.title).trim();
  const body = (input.body ?? comm.body).trim();
  if (!title || !body) return { ok: false, reason: 'INVALID' };
  const due = input.dueAt ? new Date(input.dueAt) : comm.dueAt;
  if (Number.isNaN(due.getTime())) return { ok: false, reason: 'INVALID' };
  const priority = input.priority ?? comm.priority;
  const requiresResponse = input.requiresResponse ?? comm.requiresResponse;
  const pinned = input.pinned ?? comm.pinned;
  const normalizedLinks = (input.links ?? []).filter((l) => l?.url?.trim()).map((l) => ({ label: l.label?.trim() || l.url.trim(), url: l.url.trim() }));

  const textChanged = title !== comm.title || body !== comm.body;

  // Destinatários: recalcula alvo só se o autor mandou unitIds/extraUserIds; senão mantém o atual.
  const recipientsProvided = input.unitIds !== undefined || input.extraUserIds !== undefined;
  const currentUserIds = new Set(comm.recipients.map((r) => r.userId));
  const confirmedUserIds = new Set(comm.recipients.filter((r) => r.status === 'CONFIRMED').map((r) => r.userId));

  let addedIds: string[] = [];
  let removedIds: string[] = [];
  let keptIds: string[] = [...currentUserIds];
  let targetMap: Map<string, string | null> | null = null;

  if (recipientsProvided) {
    let unitIds = [...new Set((input.unitIds ?? comm.units.map((u) => u.unitId)).filter(Boolean))];
    if (!user.seesAllUnits) unitIds = unitIds.filter((u) => user.unitIds.includes(u)); // escopo no servidor
    targetMap = await resolveTargets(user, unitIds, input.extraUserIds ?? []);
    if (targetMap.size === 0) return { ok: false, reason: 'NO_RECIPIENTS' };
    const targetIds = new Set(targetMap.keys());
    addedIds = [...targetIds].filter((uid) => !currentUserIds.has(uid));
    removedIds = [...currentUserIds].filter((uid) => !targetIds.has(uid));
    keptIds = [...currentUserIds].filter((uid) => targetIds.has(uid));
  }

  const removedConfirmed = removedIds.filter((uid) => confirmedUserIds.has(uid)).length;
  const keptConfirmed = keptIds.filter((uid) => confirmedUserIds.has(uid)).length;
  const resetOks = textChanged ? keptConfirmed : 0;

  const summary: UpdateSummary = {
    added: addedIds.length, removed: removedIds.length, kept: keptIds.length,
    resetOks, removedConfirmed, textChanged,
  };

  // Se destrói confirmações e o autor ainda não confirmou, devolve a prévia.
  const destroys = resetOks > 0 || removedConfirmed > 0;
  if (destroys && input.confirm !== true) {
    return { ok: true, applied: false, needsConfirm: true, summary };
  }

  await prisma.$transaction(async (tx) => {
    if (recipientsProvided && targetMap) {
      if (removedIds.length) await tx.communicationRecipient.deleteMany({ where: { communicationId: id, userId: { in: removedIds } } });
      if (addedIds.length) await tx.communicationRecipient.createMany({ data: addedIds.map((uid) => ({ communicationId: id, userId: uid, unitId: targetMap!.get(uid) ?? null })) });
      // Unidades-alvo (para o painel/escopo): sincroniza CommunicationUnit.
      const newUnitIds = [...new Set([...targetMap.values()].filter((u): u is string => Boolean(u)))];
      const curUnitIds = new Set(comm.units.map((u) => u.unitId));
      const addUnits = newUnitIds.filter((u) => !curUnitIds.has(u));
      const delUnits = [...curUnitIds].filter((u) => !newUnitIds.includes(u));
      if (delUnits.length) await tx.communicationUnit.deleteMany({ where: { communicationId: id, unitId: { in: delUnits } } });
      if (addUnits.length) await tx.communicationUnit.createMany({ data: addUnits.map((unitId) => ({ communicationId: id, unitId })) });
    }
    await tx.communication.update({
      where: { id },
      data: {
        title, body, priority, requiresResponse, pinned, dueAt: due,
        ...(input.links !== undefined ? { links: normalizedLinks } : {}),
      },
    });
    if (textChanged) {
      await tx.communicationRecipient.updateMany({
        where: { communicationId: id },
        data: { status: 'PENDING', confirmedAt: null, late: false, responseNote: null, responsePath: null },
      });
    }
  });

  await audit({
    userId: user.id, action: 'COMMUNICATION_EDIT', module: 'COMMUNICATION', entity: 'communication', entityId: id,
    metadata: { textChanged, added: addedIds.length, removed: removedIds.length, kept: keptIds.length, removedUserIds: removedIds, addedUserIds: addedIds }, ...ctx,
  });
  if (resetOks > 0 || (textChanged && confirmedUserIds.size > 0)) {
    await audit({ userId: user.id, action: 'COMMUNICATION_OKS_RESET', module: 'COMMUNICATION', entity: 'communication', entityId: id, metadata: { resetOks }, ...ctx });
  }

  // Notificações: novos ("novo comunicado"); se resetou, os que permaneceram ("confirme de novo").
  if (addedIds.length) {
    await notifyUsers(addedIds, {
      title: `📣 Comunicado: ${title}`, body: 'Toque para ler e confirmar.',
      link: `/modulos/comunicacao/${id}`, module: 'COMMUNICATION', critical: priority === 'URGENT',
    }).catch(() => {});
  }
  if (textChanged) {
    const notifyKept = keptIds.filter((uid) => !addedIds.includes(uid));
    if (notifyKept.length) {
      await notifyUsers(notifyKept, {
        title: `📣 Comunicado atualizado: ${title}`, body: 'O texto mudou — confirme a leitura de novo.',
        link: `/modulos/comunicacao/${id}`, module: 'COMMUNICATION', critical: priority === 'URGENT',
      }).catch(() => {});
    }
  }

  return { ok: true, applied: true, summary };
}

/** Fixa/desafixa um comunicado. APENAS o autor. Nunca reseta OKs (não é mudança de texto). */
export async function setCommunicationPinned(user: SessionUser, id: string, pinned: boolean, ctx: Ctx = {}): Promise<UpdateResult> {
  const comm = await prisma.communication.findUnique({ where: { id }, select: { authorId: true, title: true } });
  if (!comm) return { ok: false, reason: 'NOT_FOUND' };
  if (comm.authorId !== user.id) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.communication.update({ where: { id }, data: { pinned } });
  await audit({ userId: user.id, action: pinned ? 'COMMUNICATION_PIN' : 'COMMUNICATION_UNPIN', module: 'COMMUNICATION', entity: 'communication', entityId: id, metadata: { title: comm.title }, ...ctx });
  return { ok: true, applied: true, summary: { added: 0, removed: 0, kept: 0, resetOks: 0, removedConfirmed: 0, textChanged: false } };
}
