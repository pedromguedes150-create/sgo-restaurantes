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

export interface AuditExportRow {
  createdAt: Date;
  action: string;
  module: string;
  user: string;
  unit: string;
  entity: string;
  entityId: string;
  ip: string;
}

/** Registros do log para relatório/export, com filtro de módulo e período (dias). */
export async function getAuditForExport(filters: { module?: string; days?: number; take?: number } = {}): Promise<AuditExportRow[]> {
  const days = filters.days && filters.days > 0 ? filters.days : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: since },
      ...(filters.module ? { module: filters.module } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: filters.take ?? 5000,
    include: { user: { select: { name: true } }, unit: { select: { name: true } } },
  });
  return rows.map((l) => ({
    createdAt: l.createdAt,
    action: l.action,
    module: l.module ?? '',
    user: l.user?.name ?? 'sistema',
    unit: l.unit?.name ?? '',
    entity: l.entity ?? '',
    entityId: l.entityId ?? '',
    ip: l.ip ?? '',
  }));
}
