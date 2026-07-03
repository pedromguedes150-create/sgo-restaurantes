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
  const pop = await prisma.pop.findUnique({ where: { id }, include: { units: { select: { unitId: true } }, sectors: { select: { sectorName: true } } } });
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

interface PopInput {
  title: string;
  category?: string;
  blocks: PopBlock[];
  unitIds: string[];
  isInitial?: boolean;
  recurrence?: 'ONCE' | 'MONTHLY';
  sectorNames?: string[];
}

/** Admin cria/publica um POP. Treinamento: isInitial e/ou setores + recorrência. */
export async function createPop(user: SessionUser, input: PopInput, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' };
  if (!input.title?.trim() || input.unitIds.length === 0) return { ok: false as const, reason: 'INVALID' };
  const sectors = dedupeSectors(input.sectorNames);
  const pop = await prisma.pop.create({
    data: {
      title: input.title.trim(),
      category: input.category || null,
      sector: sectors[0] ?? null, // compat com o campo legado
      status: 'PUBLISHED',
      version: 1,
      isInitial: sectors.length > 0 ? false : Boolean(input.isInitial), // setorial e inicial são exclusivos
      recurrence: input.recurrence === 'MONTHLY' ? 'MONTHLY' : 'ONCE',
      content: input.blocks as unknown as Prisma.InputJsonValue,
      units: { create: input.unitIds.map((unitId) => ({ unitId })) },
      sectors: { create: sectors.map((sectorName) => ({ sectorName })) },
    },
  });
  await audit({ userId: user.id, action: 'POP_PUBLISH', module: 'POPS', entity: 'pop', entityId: pop.id, ...ctx });
  await reconcileForUnits(input.unitIds);
  return { ok: true as const, id: pop.id };
}

/** Admin edita um POP. Se o conteúdo mudar, incrementa a versão (gera re-treino). */
export async function updatePop(user: SessionUser, id: string, input: PopInput & { bumpVersion?: boolean }, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' };
  if (!input.title?.trim() || input.unitIds.length === 0) return { ok: false as const, reason: 'INVALID' };
  const current = await prisma.pop.findUnique({ where: { id }, select: { version: true, content: true, units: { select: { unitId: true } } } });
  if (!current) return { ok: false as const, reason: 'INVALID' };
  const sectors = dedupeSectors(input.sectorNames);
  const contentChanged = JSON.stringify(current.content) !== JSON.stringify(input.blocks);
  const newVersion = (input.bumpVersion ?? contentChanged) ? current.version + 1 : current.version;

  await prisma.$transaction(async (tx) => {
    await tx.popUnit.deleteMany({ where: { popId: id } });
    await tx.popSector.deleteMany({ where: { popId: id } });
    await tx.pop.update({
      where: { id },
      data: {
        title: input.title.trim(),
        category: input.category || null,
        sector: sectors[0] ?? null,
        isInitial: sectors.length > 0 ? false : Boolean(input.isInitial), // setorial e inicial são exclusivos
        recurrence: input.recurrence === 'MONTHLY' ? 'MONTHLY' : 'ONCE',
        version: newVersion,
        content: input.blocks as unknown as Prisma.InputJsonValue,
        units: { create: input.unitIds.map((unitId) => ({ unitId })) },
        sectors: { create: sectors.map((sectorName) => ({ sectorName })) },
      },
    });
  });
  await audit({ userId: user.id, action: 'POP_UPDATE', module: 'POPS', entity: 'pop', entityId: id, metadata: { version: newVersion, contentChanged }, ...ctx });
  // reconcilia nas unidades atuais e nas antigas (caso tenha saído de alguma)
  await reconcileForUnits([...new Set([...input.unitIds, ...current.units.map((u) => u.unitId)])]);
  return { ok: true as const, id, version: newVersion };
}

export async function deletePop(user: SessionUser, id: string, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' };
  const pop = await prisma.pop.findUnique({ where: { id }, select: { units: { select: { unitId: true } } } });
  if (!pop) return { ok: false as const, reason: 'INVALID' };
  await prisma.pop.delete({ where: { id } }); // units/sectors/reads/trainings em cascade
  await audit({ userId: user.id, action: 'POP_DELETE', module: 'POPS', entity: 'pop', entityId: id, ...ctx });
  return { ok: true as const };
}

function dedupeSectors(names?: string[]): string[] {
  if (!names) return [];
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))];
}
async function reconcileForUnits(unitIds: string[]) {
  const { reconcileTrainingForUnit } = await import('@/lib/training');
  for (const u of [...new Set(unitIds)]) await reconcileTrainingForUnit(u).catch(() => {});
}

/** Painel de confirmações (quem leu) para um POP — Admin/Supervisor. */
export async function getPopReadStatus(popId: string) {
  const pop = await prisma.pop.findUnique({ where: { id: popId }, select: { version: true } });
  if (!pop) return null;
  const reads = await prisma.popRead.findMany({ where: { popId, version: pop.version }, include: { user: { select: { name: true } } } });
  return { version: pop.version, reads: reads.map((r) => ({ name: r.user.name, at: r.readAt })) };
}
