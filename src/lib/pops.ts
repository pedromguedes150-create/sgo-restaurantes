import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';

export interface PopBlock {
  type: 'text' | 'image' | 'video' | 'checklist';
  text?: string;
  url?: string;
  items?: string[];
}

/** POPs publicados visíveis ao usuário + se ele já confirmou a versão atual. */
export async function listPopsForUser(user: SessionUser) {
  const pops = await prisma.pop.findMany({
    where: { status: 'PUBLISHED', units: { some: { ...unitScopeWhere(user, 'unitId') } } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
  const reads = await prisma.popRead.findMany({ where: { userId: user.id, popId: { in: pops.map((p) => p.id) } } });
  const readSet = new Set(reads.map((r) => `${r.popId}:${r.version}`));
  return pops.map((p) => ({ ...p, confirmed: readSet.has(`${p.id}:${p.version}`) }));
}

export async function getPop(user: SessionUser, id: string) {
  const pop = await prisma.pop.findUnique({ where: { id }, include: { units: { select: { unitId: true } } } });
  if (!pop) return null;
  // acesso: seesAll ou interseção de unidades
  if (!user.seesAllUnits && !pop.units.some((u) => user.unitIds.includes(u.unitId))) return null;
  const read = await prisma.popRead.findUnique({ where: { popId_userId_version: { popId: id, userId: user.id, version: pop.version } } }).catch(() => null);
  return { ...pop, confirmed: Boolean(read) };
}

export async function confirmRead(user: SessionUser, popId: string, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  const pop = await prisma.pop.findUnique({ where: { id: popId }, select: { version: true } });
  if (!pop) return { ok: false as const };
  await prisma.popRead.upsert({
    where: { popId_userId_version: { popId, userId: user.id, version: pop.version } },
    create: { popId, userId: user.id, version: pop.version },
    update: {},
  });
  await audit({ userId: user.id, action: 'POP_READ', module: 'POPS', entity: 'pop', entityId: popId, metadata: { version: pop.version }, ...ctx });
  return { ok: true as const };
}

/** Admin cria/publica um POP (MVP: blocos de texto). Atualização incrementa versão. */
export async function createPop(
  user: SessionUser,
  input: { title: string; category?: string; sector?: string; blocks: PopBlock[]; unitIds: string[] },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' };
  if (!input.title?.trim() || input.unitIds.length === 0) return { ok: false as const, reason: 'INVALID' };
  const pop = await prisma.pop.create({
    data: {
      title: input.title.trim(),
      category: input.category || null,
      sector: input.sector || null,
      status: 'PUBLISHED',
      version: 1,
      content: input.blocks as unknown as Prisma.InputJsonValue,
      units: { create: input.unitIds.map((unitId) => ({ unitId })) },
    },
  });
  await audit({ userId: user.id, action: 'POP_PUBLISH', module: 'POPS', entity: 'pop', entityId: pop.id, ...ctx });
  return { ok: true as const, id: pop.id };
}

/** Painel de confirmações (quem leu) para um POP — Admin/Supervisor. */
export async function getPopReadStatus(popId: string) {
  const pop = await prisma.pop.findUnique({ where: { id: popId }, select: { version: true } });
  if (!pop) return null;
  const reads = await prisma.popRead.findMany({ where: { popId, version: pop.version }, include: { user: { select: { name: true } } } });
  return { version: pop.version, reads: reads.map((r) => ({ name: r.user.name, at: r.readAt })) };
}
