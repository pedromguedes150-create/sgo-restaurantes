import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

type Ctx = { ip?: string | null; userAgent?: string | null };
export type WfResult = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

export type Coverage = 'ok' | 'partial' | 'none';

/** Setores de referência (padrão) p/ acelerar a criação em cada unidade. Ordem alfabética. */
export const STANDARD_SECTORS = [
  'Açougue', 'Atendimento', 'Bar', 'Caixa', 'Churrasqueira', 'Copa', 'Cozinha',
  'Estoque', 'Forno', 'Garçom', 'Limpeza', 'Recepção', 'Salão', 'Sobremesas',
];

/** Rótulo de exibição de um turno (nome + faixa de horário, se houver). */
export function shiftLabel(s: { name: string; startTime?: string | null; endTime?: string | null }): string {
  if (s.startTime && s.endTime) return `${s.name} ${s.startTime}-${s.endTime}`;
  return s.name;
}

export interface WorkforceGrid {
  sectors: { id: string; name: string; minHeadcount: number }[];
  shifts: { id: string | null; label: string }[];
  /** cells[sectorId][label] = colaboradores alocados */
  cells: Record<string, Record<string, { id: string; name: string; source: string }[]>>;
  coverage: Record<string, Record<string, Coverage>>;
}

/** Monta a grade Setor × Turno × Colaboradores + cobertura (Módulo 9.3). */
export async function getWorkforceGrid(unitId: string): Promise<WorkforceGrid> {
  const [sectors, turnos, allocations] = await Promise.all([
    prisma.sector.findMany({ where: { unitId, active: true }, orderBy: { name: 'asc' } }),
    prisma.shift.findMany({ where: { unitId, active: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
    prisma.workforceAllocation.findMany({ where: { unitId }, include: { collaborator: { select: { name: true } }, shiftRef: true } }),
  ]);

  // Colunas: turnos cadastrados + rótulos legados presentes em alocações sem turno
  const cols: { id: string | null; label: string }[] = turnos.map((t) => ({ id: t.id, label: shiftLabel(t) }));
  const colByLabel = new Map(cols.map((c) => [c.label, c]));
  const allocLabel = (a: (typeof allocations)[number]) => (a.shiftRef ? shiftLabel(a.shiftRef) : a.shift);
  for (const a of allocations) {
    const label = allocLabel(a);
    if (!colByLabel.has(label)) {
      const c = { id: a.shiftRef?.id ?? null, label };
      colByLabel.set(label, c);
      cols.push(c);
    }
  }

  const cells: WorkforceGrid['cells'] = {};
  const coverage: WorkforceGrid['coverage'] = {};
  for (const s of sectors) {
    cells[s.id] = {};
    coverage[s.id] = {};
    for (const col of cols) {
      const people = allocations
        .filter((a) => a.sectorId === s.id && allocLabel(a) === col.label)
        .map((a) => ({ id: a.id, name: a.collaborator?.name ?? a.collaboratorName ?? '—', source: a.source }));
      cells[s.id][col.label] = people;
      coverage[s.id][col.label] = people.length === 0 ? 'none' : people.length < s.minHeadcount ? 'partial' : 'ok';
    }
  }

  return { sectors: sectors.map((s) => ({ id: s.id, name: s.name, minHeadcount: s.minHeadcount })), shifts: cols, cells, coverage };
}

/* ───────── Setores (Admin) ───────── */
export async function createSector(user: SessionUser, input: { unitId: string; name: string; minHeadcount?: number }, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!input.unitId || !input.name?.trim()) return { ok: false, reason: 'INVALID' };
  const s = await prisma.sector.create({ data: { unitId: input.unitId, name: input.name.trim(), minHeadcount: Math.max(0, Math.trunc(input.minHeadcount ?? 1)) } });
  await audit({ userId: user.id, unitId: input.unitId, action: 'SECTOR_CREATE', module: 'PEOPLE', entity: 'sector', entityId: s.id, ...ctx });
  return { ok: true, id: s.id };
}

export async function updateSector(user: SessionUser, id: string, input: { name?: string; minHeadcount?: number }, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (input.name !== undefined && !input.name.trim()) return { ok: false, reason: 'INVALID' };
  await prisma.sector.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.minHeadcount !== undefined ? { minHeadcount: Math.max(0, Math.trunc(input.minHeadcount)) } : {}),
    },
  });
  await audit({ userId: user.id, action: 'SECTOR_UPDATE', module: 'PEOPLE', entity: 'sector', entityId: id, ...ctx });
  return { ok: true };
}

export async function toggleSector(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  await prisma.sector.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'SECTOR_ACTIVATE' : 'SECTOR_DEACTIVATE', module: 'PEOPLE', entity: 'sector', entityId: id, ...ctx });
  return { ok: true };
}

export async function deleteSector(user: SessionUser, id: string, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const s = await prisma.sector.findUnique({ where: { id }, select: { unitId: true } });
  if (!s) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.sector.delete({ where: { id } }); // alocações do setor saem em cascade
  await audit({ userId: user.id, unitId: s.unitId, action: 'SECTOR_DELETE', module: 'PEOPLE', entity: 'sector', entityId: id, ...ctx });
  return { ok: true };
}

/* ───────── Turnos / horários por unidade (Admin) ───────── */
export async function listShifts(unitId: string) {
  return prisma.shift.findMany({ where: { unitId }, orderBy: [{ order: 'asc' }, { name: 'asc' }] });
}

export async function createShift(user: SessionUser, input: { unitId: string; name: string; startTime?: string; endTime?: string }, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!input.unitId || !input.name?.trim()) return { ok: false, reason: 'INVALID' };
  const count = await prisma.shift.count({ where: { unitId: input.unitId } });
  const s = await prisma.shift.create({
    data: { unitId: input.unitId, name: input.name.trim(), startTime: input.startTime?.trim() || null, endTime: input.endTime?.trim() || null, order: count },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'SHIFT_CREATE', module: 'PEOPLE', entity: 'shift', entityId: s.id, ...ctx });
  return { ok: true, id: s.id };
}

export async function updateShift(user: SessionUser, id: string, input: { name?: string; startTime?: string; endTime?: string; active?: boolean }, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (input.name !== undefined && !input.name.trim()) return { ok: false, reason: 'INVALID' };
  await prisma.shift.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.startTime !== undefined ? { startTime: input.startTime.trim() || null } : {}),
      ...(input.endTime !== undefined ? { endTime: input.endTime.trim() || null } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
  await audit({ userId: user.id, action: 'SHIFT_UPDATE', module: 'PEOPLE', entity: 'shift', entityId: id, ...ctx });
  return { ok: true };
}

export async function deleteShift(user: SessionUser, id: string, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const s = await prisma.shift.findUnique({ where: { id }, select: { unitId: true } });
  if (!s) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.shift.delete({ where: { id } }); // alocações: shiftId vira NULL (mantém rótulo)
  await audit({ userId: user.id, unitId: s.unitId, action: 'SHIFT_DELETE', module: 'PEOPLE', entity: 'shift', entityId: id, ...ctx });
  return { ok: true };
}

/* ───────── Alocação (gerente/coordenador/supervisor/admin com acesso) ───────── */
export async function allocate(user: SessionUser, input: { unitId: string; sectorId: string; shiftId?: string; shift?: string; collaboratorId: string }, ctx: Ctx = {}): Promise<WfResult> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.sectorId || !input.collaboratorId) return { ok: false, reason: 'INVALID' };

  // Resolve o turno: por id (preferido) ou rótulo livre (compat)
  let shiftId: string | null = null;
  let shiftText = input.shift?.trim() || '';
  if (input.shiftId) {
    const turno = await prisma.shift.findUnique({ where: { id: input.shiftId }, select: { unitId: true, name: true, startTime: true, endTime: true } });
    if (!turno || turno.unitId !== input.unitId) return { ok: false, reason: 'INVALID' };
    shiftId = input.shiftId;
    shiftText = shiftLabel(turno);
  }
  if (!shiftText) return { ok: false, reason: 'INVALID' };

  const [sector, link] = await Promise.all([
    prisma.sector.findUnique({ where: { id: input.sectorId }, select: { unitId: true } }),
    prisma.collaboratorUnit.findUnique({
      where: { collaboratorId_unitId: { collaboratorId: input.collaboratorId, unitId: input.unitId } },
      select: { id: true },
    }),
  ]);
  if (!sector || sector.unitId !== input.unitId || !link) return { ok: false, reason: 'INVALID' };
  const a = await prisma.workforceAllocation.create({ data: { unitId: input.unitId, sectorId: input.sectorId, shift: shiftText, shiftId, collaboratorId: input.collaboratorId, source: 'MANUAL' } });
  await audit({ userId: user.id, unitId: input.unitId, action: 'ALLOCATE', module: 'PEOPLE', entity: 'workforce_allocation', entityId: a.id, ...ctx });
  await notifyWorkforceChange(user, input.unitId, input.sectorId, input.collaboratorId, shiftText, 'alocou', `/modulos/pessoas/mapa?unit=${input.unitId}`);
  await reconcileTraining(input.unitId); // gera os treinamentos do novo setor
  return { ok: true, id: a.id };
}

export async function removeAllocation(user: SessionUser, id: string, ctx: Ctx = {}): Promise<WfResult> {
  const a = await prisma.workforceAllocation.findUnique({
    where: { id },
    include: { sector: { select: { name: true } }, collaborator: { select: { name: true } }, unit: { select: { name: true } } },
  });
  if (!a) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, a.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.workforceAllocation.delete({ where: { id } });
  await audit({ userId: user.id, unitId: a.unitId, action: 'DEALLOCATE', module: 'PEOPLE', entity: 'workforce_allocation', entityId: id, ...ctx });
  await reconcileTraining(a.unitId); // remove pendências de treinamento do setor que saiu
  const who = a.collaborator?.name ?? a.collaboratorName ?? 'colaborador';
  await notifyAdmins({
    title: 'Mapa de Funções alterado',
    body: `${user.name} removeu ${who} de ${a.sector?.name ?? 'setor'} / ${a.shift} (${a.unit?.name ?? ''}). Avise o RH.`,
    link: `/modulos/pessoas/mapa?unit=${a.unitId}`,
    module: 'PEOPLE',
  });
  return { ok: true };
}

/** Reconciliação de treinamentos da unidade (import dinâmico evita ciclo). */
async function reconcileTraining(unitId: string) {
  const { reconcileTrainingForUnit } = await import('@/lib/training');
  await reconcileTrainingForUnit(unitId).catch(() => {});
}

/** Notifica os administradores sobre uma alteração de alocação (avisar o RH). */
async function notifyWorkforceChange(user: SessionUser, unitId: string, sectorId: string, collaboratorId: string, shift: string, verbo: string, link: string) {
  const [unit, sector, collab] = await Promise.all([
    prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } }),
    prisma.sector.findUnique({ where: { id: sectorId }, select: { name: true } }),
    prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { name: true } }),
  ]);
  await notifyAdmins({
    title: 'Mapa de Funções alterado',
    body: `${user.name} ${verbo} ${collab?.name ?? 'colaborador'} em ${sector?.name ?? 'setor'} / ${shift} (${unit?.name ?? ''}). Avise o RH.`,
    link,
    module: 'PEOPLE',
  });
}
