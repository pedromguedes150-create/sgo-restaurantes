import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUnitRole } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';

/**
 * Rotina do Supervisor — Fases B e C.
 * B: agenda de visitas por unidade + feedback registrado na conclusão,
 *    acompanhados por números (visitas no mês, atrasadas).
 * C: checklists de supervisor (criados em Configurações) preenchidos na visita;
 *    resultados congelados em JSON na própria visita.
 */
type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND'; detail?: string };

export interface ChecklistItemResult { item: string; ok: boolean; note?: string }

function canOperate(user: SessionUser): boolean {
  return user.role === 'SUPERVISOR' || user.role === 'ADMIN';
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Agenda uma visita (Supervisor/Admin). Avisa o gerente da unidade. */
export async function scheduleVisit(user: SessionUser, input: { unitId: string; scheduledDate: string }, ctx: Ctx = {}): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate ?? '')) return { ok: false, reason: 'INVALID' };

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { name: true } });
  if (!unit) return { ok: false, reason: 'NOT_FOUND' };

  const v = await prisma.supervisorVisit.create({
    data: { unitId: input.unitId, supervisorId: user.id, supervisorName: user.name, scheduledDate: input.scheduledDate },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'VISIT_SCHEDULE', module: 'SUPERVISION', entity: 'supervisor_visit', entityId: v.id, metadata: { date: input.scheduledDate }, ...ctx });
  await notifyUnitRole(input.unitId, 'MANAGER', {
    title: 'Visita do supervisor agendada',
    body: `${user.name} agendou visita à ${unit.name} em ${input.scheduledDate.split('-').reverse().join('/')}.`,
    link: '/modulos/supervisao', module: 'SUPERVISION',
  });
  return { ok: true, id: v.id };
}

/** Conclui a visita com feedback (+ checklist da visita, Fase C). */
export async function completeVisit(
  user: SessionUser,
  id: string,
  input: { feedback: string; checklistId?: string; results?: ChecklistItemResult[] },
  ctx: Ctx = {},
): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  const v = await prisma.supervisorVisit.findUnique({ where: { id }, select: { unitId: true, status: true } });
  if (!v) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, v.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (v.status !== 'PLANNED') return { ok: false, reason: 'INVALID', detail: 'Esta visita já foi concluída/cancelada.' };
  const feedback = input.feedback?.trim();
  if (!feedback) return { ok: false, reason: 'INVALID', detail: 'Escreva o feedback da visita.' };

  let checklistName: string | null = null;
  let results: ChecklistItemResult[] | null = null;
  if (input.checklistId) {
    const cl = await prisma.supervisorChecklist.findUnique({ where: { id: input.checklistId }, select: { name: true, items: true } });
    if (!cl) return { ok: false, reason: 'NOT_FOUND' };
    checklistName = cl.name;
    const items = Array.isArray(cl.items) ? (cl.items as string[]) : [];
    results = items.map((item) => {
      const r = input.results?.find((x) => x.item === item);
      return { item, ok: Boolean(r?.ok), ...(r?.note?.trim() ? { note: r.note.trim() } : {}) };
    });
  }

  await prisma.supervisorVisit.update({
    where: { id },
    data: {
      status: 'DONE', feedback, doneAt: new Date(),
      checklistId: input.checklistId ?? null, checklistName,
      checklistResults: results ? (results as unknown as Prisma.InputJsonValue) : undefined,
    },
  });
  await audit({ userId: user.id, unitId: v.unitId, action: 'VISIT_DONE', module: 'SUPERVISION', entity: 'supervisor_visit', entityId: id, metadata: { checklist: checklistName, itemsNotOk: results?.filter((r) => !r.ok).length }, ...ctx });
  await notifyUnitRole(v.unitId, 'MANAGER', {
    title: 'Feedback da visita do supervisor',
    body: `${user.name} concluiu a visita e registrou o feedback. Confira na Rotina do Supervisor.`,
    link: '/modulos/supervisao', module: 'SUPERVISION',
  });
  return { ok: true };
}

/** Cancela uma visita planejada. */
export async function cancelVisit(user: SessionUser, id: string, ctx: Ctx = {}): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  const v = await prisma.supervisorVisit.findUnique({ where: { id }, select: { unitId: true, status: true } });
  if (!v) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, v.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (v.status !== 'PLANNED') return { ok: false, reason: 'INVALID' };
  await prisma.supervisorVisit.update({ where: { id }, data: { status: 'CANCELED' } });
  await audit({ userId: user.id, unitId: v.unitId, action: 'VISIT_CANCEL', module: 'SUPERVISION', entity: 'supervisor_visit', entityId: id, ...ctx });
  return { ok: true };
}

export interface VisitRow {
  id: string; unitId: string; unitName: string; supervisorName: string; scheduledDate: string;
  status: 'PLANNED' | 'DONE' | 'CANCELED'; overdue: boolean; feedback: string | null;
  checklistName: string | null; checklistResults: ChecklistItemResult[] | null;
  doneAt: string | null;
}

export interface VisitBoard {
  upcoming: VisitRow[]; // planejadas (inclui atrasadas primeiro)
  history: VisitRow[]; // concluídas/canceladas
  month: { done: number; planned: number; overdue: number };
}

export async function getVisitBoard(user: SessionUser): Promise<VisitBoard> {
  const rows = await prisma.supervisorVisit.findMany({
    where: { ...unitScopeWhere(user, 'unitId') },
    orderBy: [{ scheduledDate: 'desc' }],
    take: 300,
  });
  const units = await prisma.unit.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.unitId))] } }, select: { id: true, name: true } });
  const unitBy = new Map(units.map((u) => [u.id, u.name]));
  const today = todayISO();
  const ym = today.slice(0, 7);

  const toRow = (r: (typeof rows)[number]): VisitRow => ({
    id: r.id, unitId: r.unitId, unitName: unitBy.get(r.unitId) ?? '—', supervisorName: r.supervisorName,
    scheduledDate: r.scheduledDate, status: r.status, overdue: r.status === 'PLANNED' && r.scheduledDate < today,
    feedback: r.feedback, checklistName: r.checklistName,
    checklistResults: r.checklistResults ? (r.checklistResults as unknown as ChecklistItemResult[]) : null,
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
  });

  const upcoming = rows.filter((r) => r.status === 'PLANNED').map(toRow)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const history = rows.filter((r) => r.status !== 'PLANNED').map(toRow);
  return {
    upcoming, history,
    month: {
      done: rows.filter((r) => r.status === 'DONE' && r.scheduledDate.startsWith(ym)).length,
      planned: upcoming.length,
      overdue: upcoming.filter((r) => r.overdue).length,
    },
  };
}

/* ───────── Checklists de supervisor (Fase C — Admin CRUD em Config) ───────── */
type AdminResult = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' };

export async function listSupervisorChecklists(onlyActive = false) {
  return prisma.supervisorChecklist.findMany({
    where: onlyActive ? { active: true } : undefined,
    orderBy: { name: 'asc' },
  });
}

export async function createSupervisorChecklist(user: SessionUser, input: { name: string; items: string[] }, ctx: Ctx = {}): Promise<AdminResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const name = input.name?.trim();
  const items = (input.items ?? []).map((i) => String(i).trim()).filter(Boolean);
  if (!name || items.length === 0) return { ok: false, reason: 'INVALID' };
  const c = await prisma.supervisorChecklist.create({ data: { name, items } });
  await audit({ userId: user.id, action: 'SUPERVISOR_CHECKLIST_CREATE', module: 'CONFIG', entity: 'supervisor_checklist', entityId: c.id, metadata: { name }, ...ctx });
  return { ok: true, id: c.id };
}

export async function updateSupervisorChecklist(user: SessionUser, id: string, input: { name?: string; items?: string[] }, ctx: Ctx = {}): Promise<AdminResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const data: { name?: string; items?: string[] } = {};
  if (input.name !== undefined) {
    if (!input.name.trim()) return { ok: false, reason: 'INVALID' };
    data.name = input.name.trim();
  }
  if (input.items !== undefined) {
    const items = input.items.map((i) => String(i).trim()).filter(Boolean);
    if (items.length === 0) return { ok: false, reason: 'INVALID' };
    data.items = items;
  }
  await prisma.supervisorChecklist.update({ where: { id }, data });
  await audit({ userId: user.id, action: 'SUPERVISOR_CHECKLIST_UPDATE', module: 'CONFIG', entity: 'supervisor_checklist', entityId: id, ...ctx });
  return { ok: true };
}

export async function toggleSupervisorChecklist(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<AdminResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  await prisma.supervisorChecklist.update({ where: { id }, data: { active: Boolean(active) } });
  await audit({ userId: user.id, action: 'SUPERVISOR_CHECKLIST_TOGGLE', module: 'CONFIG', entity: 'supervisor_checklist', entityId: id, metadata: { active }, ...ctx });
  return { ok: true };
}

export async function deleteSupervisorChecklist(user: SessionUser, id: string, ctx: Ctx = {}): Promise<AdminResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const used = await prisma.supervisorVisit.count({ where: { checklistId: id } });
  if (used > 0) {
    // com histórico: só inativa (mesma regra dos cadastros)
    await prisma.supervisorChecklist.update({ where: { id }, data: { active: false } });
  } else {
    await prisma.supervisorChecklist.delete({ where: { id } });
  }
  await audit({ userId: user.id, action: 'SUPERVISOR_CHECKLIST_DELETE', module: 'CONFIG', entity: 'supervisor_checklist', entityId: id, metadata: { softDeactivated: used > 0 }, ...ctx });
  return { ok: true };
}
