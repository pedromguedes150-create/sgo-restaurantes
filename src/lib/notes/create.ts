import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyRole, notifyAdmins } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { NoteSource } from '@prisma/client';

export interface CreateNoteInput {
  unitId: string;
  source?: NoteSource;
  accessKey?: string;
  supplierName: string;
  supplierCnpj?: string;
  supplierId?: string;
  number?: string;
  issueDate?: string;
  dueDate?: string;
  totalValue: number;
  productType?: string;
  observation?: string;
  imagePath?: string;
}

export type CreateNoteResult = { ok: true; id: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' };

/**
 * Registra uma nota recebida (Módulo 8) após a tela de confirmação obrigatória.
 * Notifica Financeiro/Administrativo (Central de Notificações em fase futura).
 */
export async function createNote(
  user: SessionUser,
  input: CreateNoteInput,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<CreateNoteResult> {
  try {
    assertUnitAccess(user, input.unitId);
  } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  if (!input.supplierName?.trim() || !input.totalValue || input.totalValue <= 0) {
    return { ok: false, reason: 'INVALID' };
  }

  const note = await prisma.receivedNote.create({
    data: {
      unitId: input.unitId,
      source: input.source ?? 'MANUAL',
      accessKey: input.accessKey?.replace(/\D/g, '') || null,
      supplierName: input.supplierName.trim(),
      supplierCnpj: input.supplierCnpj || null,
      supplierId: input.supplierId || null,
      number: input.number || null,
      issueDate: input.issueDate ? new Date(input.issueDate) : null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      totalValue: input.totalValue,
      productType: input.productType || null,
      observation: input.observation || null,
      imagePath: input.imagePath || null,
      createdById: user.id,
    },
    select: { id: true },
  });

  await audit({
    userId: user.id,
    unitId: input.unitId,
    action: 'NOTE_CREATE',
    module: 'NOTES',
    entity: 'received_note',
    entityId: note.id,
    metadata: { source: input.source, value: input.totalValue, notify: ['FINANCE', 'ADMIN'] },
    ...ctx,
  });
  // Notificação real ao Financeiro e Administrativo (spec Módulo 8)
  const payload = {
    title: 'Nova nota recebida',
    body: `${input.supplierName.trim()} — R$ ${input.totalValue.toFixed(2)} (registrada por ${user.name}).`,
    link: '/modulos/notas',
    module: 'NOTES',
  };
  await notifyRole('FINANCE', payload);
  await notifyAdmins(payload);
  return { ok: true, id: note.id };
}

export type NoteStatusResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' };

/** Atualiza status da nota (Paga / Com problema). */
export async function setNoteStatus(
  user: SessionUser,
  id: string,
  status: 'PAID' | 'PROBLEM',
  problemNote: string | undefined,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<NoteStatusResult> {
  const note = await prisma.receivedNote.findUnique({ where: { id }, select: { unitId: true } });
  if (!note) return { ok: false, reason: 'NOT_FOUND' };
  const { canAccessUnit } = await import('@/lib/scope/unit-scope');
  if (!canAccessUnit(user, note.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (status === 'PROBLEM' && !problemNote?.trim()) return { ok: false, reason: 'INVALID' };

  await prisma.receivedNote.update({
    where: { id },
    data: { status, problemNote: status === 'PROBLEM' ? problemNote!.trim() : null },
  });
  await audit({ userId: user.id, unitId: note.unitId, action: `NOTE_${status}`, module: 'NOTES', entity: 'received_note', entityId: id, ...ctx });
  return { ok: true };
}
