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
  /** Boletos da nota. Vazio ou 1 item = comportamento de sempre (boleto único). */
  installments?: { dueDate: string; value: number }[];
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
/**
 * Normaliza os boletos: descarta linha vazia, ordena por vencimento e numera.
 *
 * A ordem importa — a parcela 1 é a que vira o `dueDate` da nota, que é o campo
 * que a lista, os alertas e as exportações já usam. Se o lançamento vier fora de
 * ordem, ordenar aqui evita que o "primeiro vencimento" seja o terceiro boleto.
 */
export function normalizeInstallments(
  raw: { dueDate: string; value: number }[] | undefined,
): { seq: number; dueDate: Date; value: number }[] {
  if (!raw?.length) return [];
  return raw
    .filter((p) => p?.dueDate && Number.isFinite(p.value) && p.value > 0)
    .map((p) => ({ dueDate: new Date(p.dueDate), value: Math.round(p.value * 100) / 100 }))
    .filter((p) => !Number.isNaN(p.dueDate.getTime()))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((p, i) => ({ seq: i + 1, dueDate: p.dueDate, value: p.value }));
}

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

  const parcelas = normalizeInstallments(input.installments);

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
      /* Com parcelas, o vencimento da nota é o do PRIMEIRO boleto: é o que a
         lista, os alertas e as exportações já leem. */
      dueDate: parcelas.length > 0 ? parcelas[0].dueDate : input.dueDate ? new Date(input.dueDate) : null,
      totalValue: input.totalValue,
      productType: input.productType || null,
      observation: input.observation || null,
      imagePath: input.imagePath || null,
      createdById: user.id,
      // Nota lançada pela supervisão (gerente esqueceu) — desconta na meta (16/07)
      supervisorLaunched: user.role === 'SUPERVISOR' || user.role === 'ADMIN',
    },
    select: { id: true },
  });

  if (parcelas.length > 0) {
    await prisma.noteInstallment.createMany({
      data: parcelas.map((p) => ({ noteId: note.id, seq: p.seq, dueDate: p.dueDate, value: p.value })),
    });
  }

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
  installments?: { dueDate: string; value: number }[];
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

  const parcelasEdit = normalizeInstallments(input.installments);

  await prisma.receivedNote.update({
    where: { id },
    data: {
      ...(input.supplierName !== undefined ? { supplierName: input.supplierName.trim(), supplierId: null } : {}),
      ...(input.supplierCnpj !== undefined ? { supplierCnpj: input.supplierCnpj.trim() || null } : {}),
      ...(input.number !== undefined ? { number: input.number.trim() || null } : {}),
      ...(input.issueDate !== undefined ? { issueDate: input.issueDate ? new Date(input.issueDate) : null } : {}),
      ...(parcelasEdit.length > 0
        ? { dueDate: parcelasEdit[0].dueDate }
        : input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
      ...(input.totalValue !== undefined ? { totalValue: input.totalValue } : {}),
      ...(input.productType !== undefined ? { productType: input.productType.trim() || null } : {}),
      ...(input.observation !== undefined ? { observation: input.observation.trim() || null } : {}),
    },
  });
  /* Só mexe nas parcelas quando o formulário mandou o campo: uma edição que
     não fala de boleto (trocar o fornecedor, por exemplo) não pode apagá-los. */
  if (input.installments !== undefined) {
    await prisma.noteInstallment.deleteMany({ where: { noteId: id } });
    if (parcelasEdit.length > 0) {
      await prisma.noteInstallment.createMany({
        data: parcelasEdit.map((p) => ({ noteId: id, seq: p.seq, dueDate: p.dueDate, value: p.value })),
      });
    }
  }

  await audit({ userId: user.id, unitId: note.unitId, action: 'NOTE_UPDATE', module: 'NOTES', entity: 'received_note', entityId: id, metadata: { parcelas: parcelasEdit.length }, ...ctx });
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
