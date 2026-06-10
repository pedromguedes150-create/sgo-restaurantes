import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';

/**
 * Log de Auditoria (Módulo 12) — imutável.
 * Registra ações críticas. NUNCA expor update/delete sobre audit_logs.
 */
export interface AuditEntry {
  userId?: string | null;
  unitId?: string | null;
  action: string; // LOGIN, LOGOUT, CREATE, UPDATE, DELETE, APPROVE, ...
  module?: string; // AUTH, USERS, OCCURRENCES, ...
  entity?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        unitId: entry.unitId ?? null,
        action: entry.action,
        module: entry.module,
        entity: entry.entity,
        entityId: entry.entityId,
        metadata: entry.metadata,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    // Auditoria nunca deve derrubar a operação principal; apenas registra erro.
    console.error('[audit] falha ao gravar log:', err);
  }
}
