import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyRole, notifyAdmins, notifyUnitRole } from '@/lib/notifications';
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

  // Fornecedor digitado (não cadastrado) → pendência p/ o supervisor aprovar/cadastrar.
  if (!input.supplierId) {
    const exists = await prisma.supplier.findFirst({ where: { name: { equals: input.supplierName.trim(), mode: 'insensitive' } }, select: { id: true } });
    if (!exists) {
      const sup = {
        title: 'Fornecedor a cadastrar',
        body: `${user.name} lançou uma nota do fornecedor "${input.supplierName.trim()}"${input.supplierCnpj ? ` (CNPJ ${input.supplierCnpj})` : ''}, ainda não cadastrado. Confira e cadastre em Fornecedores.`,
        link: '/configuracoes/fornecedores',
        module: 'NOTES',
      };
      await notifyUnitRole(input.unitId, 'SUPERVISOR', sup);
      await notifyAdmins(sup);
    }
  }
  return { ok: true, id: note.id };
}

export interface UpdateNoteInput {
  supplierName?: string; supplierCnpj?: string; number?: string;
  issueDate?: string; dueDate?: string; totalValue?: number; productType?: string; observation?: string;
}
/** Perfis que podem editar/excluir notas: supervisor, admin, CEO. */
export function canManageNotes(role: string): boolean {
  return role === 'SUPERVISOR' || role === 'ADMIN' || role === 'CEO';
}

/** Edita os dados de uma nota (somente Supervisor/Admin/CEO com acesso à unidade). */
export async function updateNote(user: SessionUser, id: string, input: UpdateNoteInput, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<NoteStatusResult> {
  if (!canManageNotes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const note = await prisma.receivedNote.findUnique({ where: { id }, select: { unitId: true } });
  if (!note) return { ok: false, reason: 'NOT_FOUND' };
  const { canAccessUnit } = await import('@/lib/scope/unit-scope');
  if (!canAccessUnit(user, note.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (input.supplierName !== undefined && !input.supplierName.trim()) return { ok: false, reason: 'INVALID' };
  if (input.totalValue !== undefined && !(input.totalValue > 0)) return { ok: false, reason: 'INVALID' };

  await prisma.receivedNote.update({
    where: { id },
    data: {
      ...(input.supplierName !== undefined ? { supplierName: input.supplierName.trim(), supplierId: null } : {}),
      ...(input.supplierCnpj !== undefined ? { supplierCnpj: input.supplierCnpj.trim() || null } : {}),
      ...(input.number !== undefined ? { number: input.number.trim() || null } : {}),
      ...(input.issueDate !== undefined ? { issueDate: input.issueDate ? new Date(input.issueDate) : null } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
      ...(input.totalValue !== undefined ? { totalValue: input.totalValue } : {}),
      ...(input.productType !== undefined ? { productType: input.productType.trim() || null } : {}),
      ...(input.observation !== undefined ? { observation: input.observation.trim() || null } : {}),
    },
  });
  await audit({ userId: user.id, unitId: note.unitId, action: 'NOTE_UPDATE', module: 'NOTES', entity: 'received_note', entityId: id, ...ctx });
  return { ok: true };
}

/** Exclui uma nota (somente Supervisor/Admin/CEO com acesso à unidade). */
export async function deleteNote(user: SessionUser, id: string, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<NoteStatusResult> {
  if (!canManageNotes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const note = await prisma.receivedNote.findUnique({ where: { id }, select: { unitId: true, supplierName: true } });
  if (!note) return { ok: false, reason: 'NOT_FOUND' };
  const { canAccessUnit } = await import('@/lib/scope/unit-scope');
  if (!canAccessUnit(user, note.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.receivedNote.delete({ where: { id } });
  await audit({ userId: user.id, unitId: note.unitId, action: 'NOTE_DELETE', module: 'NOTES', entity: 'received_note', entityId: id, metadata: { supplier: note.supplierName }, ...ctx });
  return { ok: true };
}

export type NoteStatusResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' };

/** Atualiza status da nota (Paga / Com problema / Devolvida). PROBLEM e RETURNED exigem motivo. */
export async function setNoteStatus(
  user: SessionUser,
  id: string,
  status: 'PAID' | 'PROBLEM' | 'RETURNED',
  problemNote: string | undefined,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<NoteStatusResult> {
  const note = await prisma.receivedNote.findUnique({ where: { id }, select: { unitId: true } });
  if (!note) return { ok: false, reason: 'NOT_FOUND' };
  const { canAccessUnit } = await import('@/lib/scope/unit-scope');
  if (!canAccessUnit(user, note.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const needsReason = status === 'PROBLEM' || status === 'RETURNED';
  if (needsReason && !problemNote?.trim()) return { ok: false, reason: 'INVALID' };

  await prisma.receivedNote.update({
    where: { id },
    data: { status, problemNote: needsReason ? problemNote!.trim() : null },
  });
  await audit({ userId: user.id, unitId: note.unitId, action: `NOTE_${status}`, module: 'NOTES', entity: 'received_note', entityId: id, ...ctx });
  return { ok: true };
}
