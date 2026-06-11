import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

type Ctx = { ip?: string | null; userAgent?: string | null };
export type WfResult = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

export type Coverage = 'ok' | 'partial' | 'none';

export interface WorkforceGrid {
  sectors: { id: string; name: string; minHeadcount: number }[];
  shifts: string[];
  /** cells[sectorId][shift] = colaboradores alocados */
  cells: Record<string, Record<string, { id: string; name: string; source: string }[]>>;
  /** coverage[sectorId][shift] */
  coverage: Record<string, Record<string, Coverage>>;
}

/** Monta a grade Setor × Horário × Colaboradores + cobertura (Módulo 9.3). */
export async function getWorkforceGrid(unitId: string): Promise<WorkforceGrid> {
  const [sectors, allocations] = await Promise.all([
    prisma.sector.findMany({ where: { unitId, active: true }, orderBy: { order: 'asc' } }),
    prisma.workforceAllocation.findMany({ where: { unitId }, include: { collaborator: { select: { name: true } } } }),
  ]);

  const shiftSet = new Set<string>();
  for (const a of allocations) shiftSet.add(a.shift);
  const shifts = [...shiftSet].sort();

  const cells: WorkforceGrid['cells'] = {};
  const coverage: WorkforceGrid['coverage'] = {};
  for (const s of sectors) {
    cells[s.id] = {};
    coverage[s.id] = {};
    for (const shift of shifts) {
      const people = allocations
        .filter((a) => a.sectorId === s.id && a.shift === shift)
        .map((a) => ({ id: a.id, name: a.collaborator?.name ?? a.collaboratorName ?? '—', source: a.source }));
      cells[s.id][shift] = people;
      coverage[s.id][shift] = people.length === 0 ? 'none' : people.length < s.minHeadcount ? 'partial' : 'ok';
    }
  }

  return { sectors: sectors.map((s) => ({ id: s.id, name: s.name, minHeadcount: s.minHeadcount })), shifts, cells, coverage };
}

/* ───────── Setores (Admin) ───────── */
export async function createSector(user: SessionUser, input: { unitId: string; name: string; minHeadcount?: number }, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!input.unitId || !input.name?.trim()) return { ok: false, reason: 'INVALID' };
  const s = await prisma.sector.create({ data: { unitId: input.unitId, name: input.name.trim(), minHeadcount: Math.max(0, Math.trunc(input.minHeadcount ?? 1)) } });
  await audit({ userId: user.id, unitId: input.unitId, action: 'SECTOR_CREATE', module: 'PEOPLE', entity: 'sector', entityId: s.id, ...ctx });
  return { ok: true, id: s.id };
}

export async function toggleSector(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  await prisma.sector.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'SECTOR_ACTIVATE' : 'SECTOR_DEACTIVATE', module: 'PEOPLE', entity: 'sector', entityId: id, ...ctx });
  return { ok: true };
}

/* ───────── Alocação (gerente/coordenador/supervisor/admin com acesso) ───────── */
export async function allocate(user: SessionUser, input: { unitId: string; sectorId: string; shift: string; collaboratorId: string }, ctx: Ctx = {}): Promise<WfResult> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.sectorId || !input.shift?.trim() || !input.collaboratorId) return { ok: false, reason: 'INVALID' };
  const a = await prisma.workforceAllocation.create({ data: { unitId: input.unitId, sectorId: input.sectorId, shift: input.shift.trim(), collaboratorId: input.collaboratorId, source: 'MANUAL' } });
  await audit({ userId: user.id, unitId: input.unitId, action: 'ALLOCATE', module: 'PEOPLE', entity: 'workforce_allocation', entityId: a.id, ...ctx });
  return { ok: true, id: a.id };
}

export async function removeAllocation(user: SessionUser, id: string, ctx: Ctx = {}): Promise<WfResult> {
  const a = await prisma.workforceAllocation.findUnique({ where: { id }, select: { unitId: true } });
  if (!a) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, a.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.workforceAllocation.delete({ where: { id } });
  await audit({ userId: user.id, unitId: a.unitId, action: 'DEALLOCATE', module: 'PEOPLE', entity: 'workforce_allocation', entityId: id, ...ctx });
  return { ok: true };
}
