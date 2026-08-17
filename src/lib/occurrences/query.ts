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

export interface OccurrenceScope {
  unitId?: string;
  status?: OccurrenceStatus;
  gravity?: OccurrenceGravity;
  maintenance?: boolean;
  it?: boolean;
}

/** WHERE compartilhado entre a lista e o resumo — para os dois contarem A MESMA coisa. */
function occurrenceWhere(user: SessionUser, f: OccurrenceScope) {
  return {
    ...unitScopeWhere(user, 'unitId'),
    ...(f.unitId ? { unitId: f.unitId } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.gravity ? { gravity: f.gravity } : {}),
    ...(f.maintenance !== undefined ? { type: { isMaintenance: f.maintenance } } : {}),
    ...(f.it !== undefined ? { type: { isIT: f.it } } : {}),
  };
}

/**
 * Lista paginada. Devolve `total` junto porque a tela PRECISA dizer quantas
 * existem: antes vinha um `take: 50` mudo, e com 124 abertas o gerente via
 * cinquenta linhas sem nenhum sinal de que 74 ficaram de fora.
 */
export async function listOccurrences(
  user: SessionUser,
  filters: OccurrenceScope & { limit?: number; page?: number } = {},
) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const page = Math.max(filters.page ?? 1, 1);
  const where = occurrenceWhere(user, filters);

  const [items, total] = await Promise.all([
    prisma.occurrence.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        unit: { select: { name: true, code: true } },
        reportedBy: { select: { name: true } },
        type: { select: { name: true, isMaintenance: true } },
        _count: { select: { attachments: true } },
      },
    }),
    prisma.occurrence.count({ where }),
  ]);

  return { items, total, page, limit, hasMore: page * limit < total };
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

/**
 * Resumo para dashboards (respeita escopo por unidade).
 *
 * `scope` foi acrescentado porque os cartões da tela de Ocorrências contavam a
 * rede INTEIRA mesmo dentro das abas Manutenção e TI: trocar de aba não mudava
 * nenhum número, o que fazia a tela parecer quebrada. O parâmetro é opcional —
 * o dashboard continua chamando sem nada e recebe o total, como antes.
 */
export async function getOccurrenceSummary(
  user: SessionUser,
  scope: Pick<OccurrenceScope, 'maintenance' | 'it' | 'unitId'> = {},
): Promise<OccurrenceSummary> {
  const all = await prisma.occurrence.findMany({
    where: occurrenceWhere(user, scope),
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
