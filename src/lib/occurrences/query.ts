import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { OccurrenceGravity, OccurrenceStatus } from '@prisma/client';

export async function getOccurrenceTypes() {
  return prisma.occurrenceType.findMany({
    where: { active: true },
    orderBy: { order: 'asc' },
    include: {
      categories: { where: { active: true }, orderBy: { order: 'asc' }, select: { id: true, name: true } },
    },
  });
}

export async function listOccurrences(
  user: SessionUser,
  filters: { unitId?: string; status?: OccurrenceStatus; gravity?: OccurrenceGravity; maintenance?: boolean; it?: boolean; limit?: number } = {},
) {
  return prisma.occurrence.findMany({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.gravity ? { gravity: filters.gravity } : {}),
      ...(filters.maintenance !== undefined ? { type: { isMaintenance: filters.maintenance } } : {}),
      ...(filters.it !== undefined ? { type: { isIT: filters.it } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: filters.limit ?? 50,
    include: {
      unit: { select: { name: true, code: true } },
      reportedBy: { select: { name: true } },
      type: { select: { name: true, isMaintenance: true } },
      _count: { select: { attachments: true } },
    },
  });
}

export async function getOccurrence(user: SessionUser, id: string) {
  const occ = await prisma.occurrence.findUnique({
    where: { id },
    include: {
      unit: { select: { name: true, code: true } },
      reportedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      attachments: true,
      updates: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!occ || !canAccessUnit(user, occ.unitId)) return null;

  // LGPD: acesso a anexos sensíveis é auditado
  if (occ.attachments.length > 0) {
    await audit({
      userId: user.id,
      unitId: occ.unitId,
      action: 'OCC_VIEW_ATTACHMENTS',
      module: 'OCCURRENCES',
      entity: 'occurrence',
      entityId: occ.id,
      metadata: { number: occ.number, attachments: occ.attachments.length },
    });
  }
  return occ;
}

export interface OccurrenceSummary {
  open: number;
  inProgress: number;
  closed: number;
  criticalOpen: number; // ⚫ abertas → badge vermelho
  highOpen: number;
  openOver48h: number; // abertas > 48h → alerta
  recurrences30d: number;
  byGravity: Record<OccurrenceGravity, number>;
}

/** Resumo para dashboards (respeita escopo por unidade). */
export async function getOccurrenceSummary(user: SessionUser): Promise<OccurrenceSummary> {
  const scope = unitScopeWhere(user, 'unitId');
  const all = await prisma.occurrence.findMany({
    where: scope,
    select: { status: true, gravity: true, createdAt: true, isRecurrence: true },
  });

  const now = Date.now();
  const byGravity = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } as Record<OccurrenceGravity, number>;
  let open = 0,
    inProgress = 0,
    closed = 0,
    criticalOpen = 0,
    highOpen = 0,
    openOver48h = 0,
    recurrences30d = 0;

  for (const o of all) {
    byGravity[o.gravity]++;
    const isOpen = o.status !== 'CLOSED';
    if (o.status === 'OPEN') open++;
    else if (o.status === 'IN_PROGRESS') inProgress++;
    else closed++;
    if (isOpen && o.gravity === 'CRITICAL') criticalOpen++;
    if (isOpen && o.gravity === 'HIGH') highOpen++;
    if (isOpen && now - o.createdAt.getTime() > 48 * 3600 * 1000) openOver48h++;
    if (o.isRecurrence && now - o.createdAt.getTime() < 30 * 86400 * 1000) recurrences30d++;
  }

  return { open, inProgress, closed, criticalOpen, highOpen, openOver48h, recurrences30d, byGravity };
}
