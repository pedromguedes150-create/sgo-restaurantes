import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';

export function canViewAudit(user: SessionUser): boolean {
  return user.role === 'ADMIN' || user.role === 'CEO';
}

export interface AuditFilters {
  module?: string;
  action?: string;
  userId?: string;
  take?: number;
}

/** Lista o Log de Auditoria (imutável) com filtros. Admin/CEO apenas. */
export async function listAuditLogs(filters: AuditFilters = {}) {
  return prisma.auditLog.findMany({
    where: {
      ...(filters.module ? { module: filters.module } : {}),
      ...(filters.action ? { action: { contains: filters.action, mode: 'insensitive' } } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: filters.take ?? 100,
    include: { user: { select: { name: true } }, unit: { select: { name: true } } },
  });
}

export async function getAuditModules(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({ where: { module: { not: null } }, distinct: ['module'], select: { module: true }, orderBy: { module: 'asc' } });
  return rows.map((r) => r.module!).filter(Boolean);
}
