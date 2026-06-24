import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Operações administrativas sobre LANÇAMENTOS da aba Operação (Módulos).
 * Apenas ADMIN. Toda exclusão é auditada e REVERTE os efeitos vinculados
 * (tarefa do dia volta a "pendente" quando o lançamento era o que a concluía).
 * Decisão do cliente (2026-06-15): reverter efeitos vinculados + auditoria.
 */

export type OpResult = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID' };

type Ctx = { ip?: string | null; userAgent?: string | null };

function isAdmin(user: SessionUser) {
  return user.role === 'ADMIN';
}

/* ───────────────────────── Desperdícios ───────────────────────── */
export async function deleteWasteEntry(user: SessionUser, id: string, ctx: Ctx = {}): Promise<OpResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const entry = await prisma.wasteEntry.findUnique({ where: { id }, select: { unitId: true, operationalDate: true } });
  if (!entry) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.$transaction(async (tx) => {
    await tx.wasteEntry.delete({ where: { id } }); // itens em cascade
    // 1 lançamento/dia: sem ele, a(s) tarefa(s) WASTE do dia voltam a pendente
    await tx.taskInstance.updateMany({
      where: { unitId: entry.unitId, operationalDate: entry.operationalDate, template: { module: 'WASTE' }, status: 'DONE' },
      data: { status: 'PENDING', completedById: null, completedAt: null, evidencePath: null },
    });
  });
  await audit({ userId: user.id, unitId: entry.unitId, action: 'WASTE_DELETE', module: 'WASTE', entity: 'waste_entry', entityId: id, metadata: { operationalDate: entry.operationalDate, reverted: true }, ...ctx });
  return { ok: true };
}

/* ───────────────────────── Comandas ───────────────────────── */
export async function deleteCommandCount(user: SessionUser, id: string, ctx: Ctx = {}): Promise<OpResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const c = await prisma.commandCount.findUnique({ where: { id }, select: { unitId: true, operationalDate: true } });
  if (!c) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.$transaction(async (tx) => {
    await tx.commandCount.delete({ where: { id } });
    await tx.taskInstance.updateMany({
      where: { unitId: c.unitId, operationalDate: c.operationalDate, template: { module: 'COMMANDS' }, status: 'DONE' },
      data: { status: 'PENDING', completedById: null, completedAt: null },
    });
  });
  await audit({ userId: user.id, unitId: c.unitId, action: 'COMMAND_COUNT_DELETE', module: 'COMMANDS', entity: 'command_count', entityId: id, metadata: { operationalDate: c.operationalDate, reverted: true }, ...ctx });
  return { ok: true };
}

export async function deleteCommandDivergence(user: SessionUser, id: string, ctx: Ctx = {}): Promise<OpResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const d = await prisma.commandDivergence.findUnique({ where: { id }, select: { unitId: true, number: true } });
  if (!d) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.commandDivergence.delete({ where: { id } });
  await audit({ userId: user.id, unitId: d.unitId, action: 'COMMAND_DIVERGENCE_DELETE', module: 'COMMANDS', entity: 'command_divergence', entityId: id, metadata: { number: d.number }, ...ctx });
  return { ok: true };
}

/* ───────────────────────── Ocorrências ───────────────────────── */
export async function deleteOccurrence(user: SessionUser, id: string, ctx: Ctx = {}): Promise<OpResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const occ = await prisma.occurrence.findUnique({ where: { id }, select: { unitId: true, operationalDate: true, number: true } });
  if (!occ) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.$transaction(async (tx) => {
    await tx.occurrence.delete({ where: { id } }); // anexos em cascade
    // Pode haver várias ocorrências/dia: só reverte a tarefa se NÃO sobrou nenhuma
    const remaining = await tx.occurrence.count({ where: { unitId: occ.unitId, operationalDate: occ.operationalDate } });
    if (remaining === 0) {
      await tx.taskInstance.updateMany({
        where: { unitId: occ.unitId, operationalDate: occ.operationalDate, template: { module: 'OCCURRENCES' }, status: 'DONE' },
        data: { status: 'PENDING', completedById: null, completedAt: null },
      });
    }
  });
  await audit({ userId: user.id, unitId: occ.unitId, action: 'OCC_DELETE', module: 'OCCURRENCES', entity: 'occurrence', entityId: id, metadata: { number: occ.number }, ...ctx });
  return { ok: true };
}

/* ───────────────────────── Cancelamentos ───────────────────────── */
export async function deleteCancellation(user: SessionUser, id: string, ctx: Ctx = {}): Promise<OpResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const c = await prisma.cancellation.findUnique({ where: { id }, select: { unitId: true, couponNumber: true } });
  if (!c) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.cancellation.delete({ where: { id } });
  await audit({ userId: user.id, unitId: c.unitId, action: 'CANCELLATION_DELETE', module: 'CANCELLATIONS', entity: 'cancellation', entityId: id, metadata: { couponNumber: c.couponNumber }, ...ctx });
  return { ok: true };
}

/** Exclui um import inteiro de cancelamentos (e suas linhas, em cascade). */
export async function deleteCancellationImport(user: SessionUser, id: string, ctx: Ctx = {}): Promise<OpResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const imp = await prisma.cancellationImport.findUnique({ where: { id }, select: { unitId: true, fileName: true } });
  if (!imp) return { ok: false, reason: 'NOT_FOUND' };
  // Cancellation.importId é SetNull no schema: apaga as linhas deste import explicitamente
  await prisma.$transaction(async (tx) => {
    await tx.cancellation.deleteMany({ where: { importId: id } });
    await tx.cancellationImport.delete({ where: { id } });
  });
  await audit({ userId: user.id, unitId: imp.unitId, action: 'CANCELLATION_IMPORT_DELETE', module: 'CANCELLATIONS', entity: 'cancellation_import', entityId: id, metadata: { fileName: imp.fileName }, ...ctx });
  return { ok: true };
}

/* ───────────────────────── Notas recebidas ───────────────────────── */
export async function deleteReceivedNote(user: SessionUser, id: string, ctx: Ctx = {}): Promise<OpResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const n = await prisma.receivedNote.findUnique({ where: { id }, select: { unitId: true, supplierName: true } });
  if (!n) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.receivedNote.delete({ where: { id } });
  await audit({ userId: user.id, unitId: n.unitId, action: 'NOTE_DELETE', module: 'NOTES', entity: 'received_note', entityId: id, metadata: { supplier: n.supplierName }, ...ctx });
  return { ok: true };
}

/* ───────────────────────── Checklists (histórico) ───────────────────────── */
/** Exclui um registro do histórico de checklists (execução do dia). Some das metas. */
export async function deleteTaskInstance(user: SessionUser, id: string, ctx: Ctx = {}): Promise<OpResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const i = await prisma.taskInstance.findUnique({ where: { id }, select: { unitId: true, operationalDate: true, status: true, template: { select: { name: true } } } });
  if (!i) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.taskInstance.delete({ where: { id } }); // respostas/fotos em cascade
  await audit({ userId: user.id, unitId: i.unitId, action: 'TASK_INSTANCE_DELETE', module: 'CHECKLISTS', entity: 'task_instance', entityId: id, metadata: { operationalDate: i.operationalDate, status: i.status, template: i.template.name }, ...ctx });
  return { ok: true };
}

/* ───────────────────────── Comunicação ───────────────────────── */
/** Exclui um comunicado inteiro (unidades, anexos e confirmações em cascade). */
export async function deleteCommunication(user: SessionUser, id: string, ctx: Ctx = {}): Promise<OpResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const c = await prisma.communication.findUnique({ where: { id }, select: { title: true } });
  if (!c) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.communication.delete({ where: { id } });
  await audit({ userId: user.id, action: 'COMMUNICATION_DELETE', module: 'COMMUNICATION', entity: 'communication', entityId: id, metadata: { title: c.title }, ...ctx });
  return { ok: true };
}

/* ───────────────────────── Inventário ───────────────────────── */
export async function deleteInventory(user: SessionUser, id: string, ctx: Ctx = {}): Promise<OpResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const s = await prisma.inventorySchedule.findUnique({ where: { id }, select: { unitId: true } });
  if (!s) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.inventorySchedule.delete({ where: { id } });
  await audit({ userId: user.id, unitId: s.unitId, action: 'INVENTORY_DELETE', module: 'INVENTORY', entity: 'inventory_schedule', entityId: id, ...ctx });
  return { ok: true };
}
