import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUnitRole } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { MaintenanceStatus } from '@prisma/client';

const MOD = 'MAINTENANCE';
type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

// ---------------------------------------------------------------------------
// Chamados de manutenção (reativos)
// ---------------------------------------------------------------------------
export interface TicketInput {
  unitId: string; title: string; description?: string;
  equipmentId?: string; supplierId?: string; deadline?: string; occurrenceId?: string;
}

async function nextTicketNumber(unitId: string): Promise<number> {
  const last = await prisma.maintenanceTicket.findFirst({ where: { unitId }, orderBy: { number: 'desc' }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

export async function listTickets(user: SessionUser, filters: { unitId?: string; status?: MaintenanceStatus } = {}) {
  return prisma.maintenanceTicket.findMany({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });
}

export interface MaintenanceSummary { open: number; inProgress: number; overdue: number; doneMonth: number; costMonth: number }

export async function getMaintenanceSummary(user: SessionUser): Promise<MaintenanceSummary> {
  const scope = unitScopeWhere(user, 'unitId');
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const rows = await prisma.maintenanceTicket.findMany({ where: { ...scope }, select: { status: true, deadline: true, doneAt: true, cost: true } });
  let open = 0, inProgress = 0, overdue = 0, doneMonth = 0, costMonth = 0;
  for (const r of rows) {
    if (r.status === 'OPEN') open++;
    if (r.status === 'IN_PROGRESS') inProgress++;
    if ((r.status === 'OPEN' || r.status === 'IN_PROGRESS') && r.deadline && r.deadline < now) overdue++;
    if (r.status === 'DONE' && r.doneAt && r.doneAt >= monthStart) { doneMonth++; costMonth += Number(r.cost ?? 0); }
  }
  return { open, inProgress, overdue, doneMonth, costMonth };
}

async function snapshotNames(equipmentId?: string, supplierId?: string) {
  let equipmentName: string | null = null, supplierName: string | null = null;
  if (equipmentId) equipmentName = (await prisma.inventoryItem.findUnique({ where: { id: equipmentId }, select: { name: true } }))?.name ?? null;
  if (supplierId) supplierName = (await prisma.supplier.findUnique({ where: { id: supplierId }, select: { name: true } }))?.name ?? null;
  return { equipmentName, supplierName };
}

export async function createTicket(user: SessionUser, input: TicketInput, ctx: Ctx = {}): Promise<Result> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.title?.trim()) return { ok: false, reason: 'INVALID' };
  const { equipmentName, supplierName } = await snapshotNames(input.equipmentId, input.supplierId);
  const number = await nextTicketNumber(input.unitId);
  const t = await prisma.maintenanceTicket.create({
    data: {
      unitId: input.unitId, number, title: input.title.trim(), description: input.description?.trim() || null,
      equipmentId: input.equipmentId || null, equipmentName,
      supplierId: input.supplierId || null, supplierName,
      deadline: input.deadline ? new Date(input.deadline) : null,
      occurrenceId: input.occurrenceId || null,
      openedById: user.id, openedByName: user.name,
    },
    select: { id: true },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'MAINT_TICKET_OPEN', module: MOD, entity: 'maintenance_ticket', entityId: t.id, ...ctx });
  await notifyUnitRole(input.unitId, 'SUPERVISOR', { title: 'Novo chamado de manutenção', body: `#${number} — ${input.title.trim()} (aberto por ${user.name})`, link: '/modulos/manutencao', module: MOD });
  return { ok: true, id: t.id };
}

export async function advanceTicket(user: SessionUser, id: string, action: 'start' | 'done' | 'cancel' | 'reopen', extra: { cost?: number; resolutionNote?: string } = {}, ctx: Ctx = {}): Promise<Result> {
  const t = await prisma.maintenanceTicket.findUnique({ where: { id }, select: { unitId: true, number: true } });
  if (!t) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, t.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const data: Record<string, unknown> = {};
  if (action === 'start') data.status = 'IN_PROGRESS';
  else if (action === 'cancel') data.status = 'CANCELED';
  else if (action === 'reopen') { data.status = 'OPEN'; data.doneAt = null; data.doneById = null; data.doneByName = null; }
  else if (action === 'done') {
    data.status = 'DONE'; data.doneAt = new Date(); data.doneById = user.id; data.doneByName = user.name;
    if (extra.cost != null && !Number.isNaN(extra.cost)) data.cost = extra.cost;
    if (extra.resolutionNote?.trim()) data.resolutionNote = extra.resolutionNote.trim();
  }
  await prisma.maintenanceTicket.update({ where: { id }, data });
  await audit({ userId: user.id, unitId: t.unitId, action: `MAINT_TICKET_${action.toUpperCase()}`, module: MOD, entity: 'maintenance_ticket', entityId: id, ...ctx });
  return { ok: true };
}

export async function updateTicket(user: SessionUser, id: string, patch: { title?: string; description?: string; supplierId?: string; deadline?: string; cost?: number }, ctx: Ctx = {}): Promise<Result> {
  const t = await prisma.maintenanceTicket.findUnique({ where: { id }, select: { unitId: true } });
  if (!t) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, t.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) { if (!patch.title.trim()) return { ok: false, reason: 'INVALID' }; data.title = patch.title.trim(); }
  if (patch.description !== undefined) data.description = patch.description.trim() || null;
  if (patch.supplierId !== undefined) {
    data.supplierId = patch.supplierId || null;
    data.supplierName = patch.supplierId ? (await prisma.supplier.findUnique({ where: { id: patch.supplierId }, select: { name: true } }))?.name ?? null : null;
  }
  if (patch.deadline !== undefined) data.deadline = patch.deadline ? new Date(patch.deadline) : null;
  if (patch.cost !== undefined && !Number.isNaN(patch.cost)) data.cost = patch.cost;
  await prisma.maintenanceTicket.update({ where: { id }, data });
  await audit({ userId: user.id, unitId: t.unitId, action: 'MAINT_TICKET_UPDATE', module: MOD, entity: 'maintenance_ticket', entityId: id, ...ctx });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Planos preventivos (recorrentes por equipamento)
// ---------------------------------------------------------------------------
export interface PlanInput { unitId: string; title: string; description?: string; equipmentId?: string; frequencyDays: number; firstDueAt?: string }

function addDays(base: Date, days: number): Date { return new Date(base.getTime() + days * 24 * 60 * 60 * 1000); }

export async function listPlans(user: SessionUser, filters: { unitId?: string } = {}) {
  return prisma.maintenancePlan.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(filters.unitId ? { unitId: filters.unitId } : {}) },
    orderBy: [{ active: 'desc' }, { nextDueAt: 'asc' }],
    take: 200,
    include: { logs: { orderBy: { doneAt: 'desc' }, take: 3 } },
  });
}

export async function createPlan(user: SessionUser, input: PlanInput, ctx: Ctx = {}): Promise<Result> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const freq = Math.round(Number(input.frequencyDays));
  if (!input.title?.trim() || !(freq > 0)) return { ok: false, reason: 'INVALID' };
  const { equipmentName } = await snapshotNames(input.equipmentId);
  const nextDueAt = input.firstDueAt ? new Date(input.firstDueAt) : addDays(new Date(), freq);
  const p = await prisma.maintenancePlan.create({
    data: {
      unitId: input.unitId, title: input.title.trim(), description: input.description?.trim() || null,
      equipmentId: input.equipmentId || null, equipmentName,
      frequencyDays: freq, nextDueAt, createdById: user.id,
    },
    select: { id: true },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'MAINT_PLAN_CREATE', module: MOD, entity: 'maintenance_plan', entityId: p.id, ...ctx });
  return { ok: true, id: p.id };
}

export async function updatePlan(user: SessionUser, id: string, patch: { title?: string; description?: string; frequencyDays?: number; active?: boolean; nextDueAt?: string }, ctx: Ctx = {}): Promise<Result> {
  const p = await prisma.maintenancePlan.findUnique({ where: { id }, select: { unitId: true } });
  if (!p) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, p.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) { if (!patch.title.trim()) return { ok: false, reason: 'INVALID' }; data.title = patch.title.trim(); }
  if (patch.description !== undefined) data.description = patch.description.trim() || null;
  if (patch.frequencyDays !== undefined) { const f = Math.round(Number(patch.frequencyDays)); if (f > 0) data.frequencyDays = f; }
  if (patch.active !== undefined) data.active = patch.active;
  if (patch.nextDueAt !== undefined && patch.nextDueAt) { data.nextDueAt = new Date(patch.nextDueAt); data.lastNotifiedAt = null; }
  await prisma.maintenancePlan.update({ where: { id }, data });
  await audit({ userId: user.id, unitId: p.unitId, action: 'MAINT_PLAN_UPDATE', module: MOD, entity: 'maintenance_plan', entityId: id, ...ctx });
  return { ok: true };
}

/** Registra a execução de um plano preventivo: agenda a próxima e guarda no histórico. */
export async function registerPlanExecution(user: SessionUser, id: string, note: string | undefined, ctx: Ctx = {}): Promise<Result> {
  const p = await prisma.maintenancePlan.findUnique({ where: { id }, select: { unitId: true, frequencyDays: true } });
  if (!p) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, p.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const now = new Date();
  await prisma.$transaction([
    prisma.maintenancePlanLog.create({ data: { planId: id, doneAt: now, doneById: user.id, doneByName: user.name, note: note?.trim() || null } }),
    prisma.maintenancePlan.update({ where: { id }, data: { lastDoneAt: now, nextDueAt: addDays(now, p.frequencyDays), lastNotifiedAt: null } }),
  ]);
  await audit({ userId: user.id, unitId: p.unitId, action: 'MAINT_PLAN_DONE', module: MOD, entity: 'maintenance_plan', entityId: id, ...ctx });
  return { ok: true };
}

/** Scheduler: avisa gerentes/supervisão dos planos preventivos vencidos (1×/dia por plano). */
export async function runDueMaintenancePlans(): Promise<{ notified: number }> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = await prisma.maintenancePlan.findMany({
    where: { active: true, nextDueAt: { lte: now }, OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: startOfDay } }] },
    select: { id: true, unitId: true, title: true, equipmentName: true },
  });
  for (const p of due) {
    const payload = { title: 'Manutenção preventiva vencida', body: `${p.title}${p.equipmentName ? ` — ${p.equipmentName}` : ''} está no prazo de manutenção.`, link: '/modulos/manutencao?view=preventiva', module: MOD };
    await notifyUnitRole(p.unitId, 'MANAGER', payload).catch(() => {});
    await notifyUnitRole(p.unitId, 'SUPERVISOR', payload).catch(() => {});
    await prisma.maintenancePlan.update({ where: { id: p.id }, data: { lastNotifiedAt: now } });
  }
  return { notified: due.length };
}
