import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

export async function listProductStandards(opts: { activeOnly?: boolean; category?: string } = {}) {
  return prisma.productStandard.findMany({
    where: { ...(opts.activeOnly ? { active: true } : {}), ...(opts.category ? { category: opts.category } : {}) },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}
export async function listStandardCategories(): Promise<string[]> {
  const rows = await prisma.productStandard.findMany({ where: { active: true }, select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } });
  return rows.map((r) => r.category);
}

export type PSResult = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' };

export async function createProductStandard(user: SessionUser, input: { category: string; name: string; description?: string; photoPath?: string }, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<PSResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!input.category?.trim() || !input.name?.trim()) return { ok: false, reason: 'INVALID' };
  const p = await prisma.productStandard.create({ data: { category: input.category.trim(), name: input.name.trim(), description: input.description?.trim() || null, photoPath: input.photoPath || null, createdById: user.id } });
  await audit({ userId: user.id, action: 'PRODUCT_STANDARD_CREATE', module: 'CONFIG', entity: 'product_standard', entityId: p.id, metadata: { category: input.category, name: input.name }, ...ctx });
  return { ok: true, id: p.id };
}
export async function toggleProductStandard(user: SessionUser, id: string, active: boolean): Promise<PSResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  await prisma.productStandard.update({ where: { id }, data: { active } });
  return { ok: true };
}
export async function deleteProductStandard(user: SessionUser, id: string, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<PSResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  await prisma.productStandard.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, action: 'PRODUCT_STANDARD_DELETE', module: 'CONFIG', entity: 'product_standard', entityId: id, ...ctx });
  return { ok: true };
}
