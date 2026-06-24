import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Cadastro de fornecedores — lista COMPARTILHADA (Gás, Notas Recebidas, Pagamentos).
 * Alimentada por Admin, CEO e Supervisor.
 */
export function canManageSuppliers(user: SessionUser): boolean {
  return user.role === 'ADMIN' || user.role === 'CEO' || user.role === 'SUPERVISOR';
}

export type SupplierResult = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'BLOCKED' };
type Ctx = { ip?: string | null; userAgent?: string | null };

export async function listSuppliers(opts: { activeOnly?: boolean } = {}) {
  return prisma.supplier.findMany({
    where: opts.activeOnly ? { active: true } : {},
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, cnpj: true, pixKey: true, category: true, notes: true, active: true },
  });
}

export async function createSupplier(user: SessionUser, input: { name: string; cnpj?: string; pixKey?: string; category?: string; notes?: string }, ctx: Ctx = {}): Promise<SupplierResult> {
  if (!canManageSuppliers(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.name?.trim()) return { ok: false, reason: 'INVALID' };
  const s = await prisma.supplier.create({
    data: {
      name: input.name.trim(),
      cnpj: input.cnpj?.trim() || null,
      pixKey: input.pixKey?.trim() || null,
      category: input.category?.trim() || null,
      notes: input.notes?.trim() || null,
      createdById: user.id,
    },
  });
  await audit({ userId: user.id, action: 'SUPPLIER_CREATE', module: 'CONFIG', entity: 'supplier', entityId: s.id, ...ctx });
  return { ok: true, id: s.id };
}

export async function updateSupplier(user: SessionUser, id: string, input: { name?: string; cnpj?: string; pixKey?: string; category?: string; notes?: string }, ctx: Ctx = {}): Promise<SupplierResult> {
  if (!canManageSuppliers(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (input.name !== undefined && !input.name.trim()) return { ok: false, reason: 'INVALID' };
  await prisma.supplier.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.cnpj !== undefined ? { cnpj: input.cnpj.trim() || null } : {}),
      ...(input.pixKey !== undefined ? { pixKey: input.pixKey.trim() || null } : {}),
      ...(input.category !== undefined ? { category: input.category.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
    },
  });
  await audit({ userId: user.id, action: 'SUPPLIER_UPDATE', module: 'CONFIG', entity: 'supplier', entityId: id, ...ctx });
  return { ok: true };
}

export async function toggleSupplier(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<SupplierResult> {
  if (!canManageSuppliers(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.supplier.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'SUPPLIER_ACTIVATE' : 'SUPPLIER_DEACTIVATE', module: 'CONFIG', entity: 'supplier', entityId: id, ...ctx });
  return { ok: true };
}

export async function deleteSupplier(user: SessionUser, id: string, ctx: Ctx = {}): Promise<SupplierResult> {
  if (!canManageSuppliers(user)) return { ok: false, reason: 'FORBIDDEN' };
  const [gas, notes, pays] = await Promise.all([
    prisma.gasReceipt.count({ where: { supplierId: id } }),
    prisma.receivedNote.count({ where: { supplierId: id } }),
    prisma.paymentRequest.count({ where: { supplierId: id } }),
  ]);
  if (gas + notes + pays > 0) return { ok: false, reason: 'BLOCKED' };
  await prisma.supplier.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, action: 'SUPPLIER_DELETE', module: 'CONFIG', entity: 'supplier', entityId: id, ...ctx });
  return { ok: true };
}
