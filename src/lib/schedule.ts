import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { ScheduleType, DayStatus } from '@prisma/client';

/**
 * Escala (Fase D) — PLANEJADO (gerado do padrão + ajustes) × REALIZADO (editável).
 * Datas tratadas como dia de calendário em UTC ao meio-dia (evita drift de fuso).
 */

type Ctx = { ip?: string | null; userAgent?: string | null };
export type SchedResult = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

/* ───────── Rótulos ───────── */
export const TYPE_LABELS: Record<ScheduleType, string> = {
  TWELVE36_ODD: '12x36 — Turno Ímpar',
  TWELVE36_EVEN: '12x36 — Turno Par',
  SIX_ONE: '6x1',
  FIVE_TWO: '5x2',
  CUSTOM: 'Personalizada',
};
export const STATUS_CODE: Record<DayStatus, string> = {
  WORK: 'T', OFF: 'F', FALTA_INJUST: 'FI', FALTA_JUST: 'FJ', ATESTADO: 'A', FERIAS: 'FE',
};
export const STATUS_LABEL: Record<DayStatus, string> = {
  WORK: 'Trabalho', OFF: 'Folga', FALTA_INJUST: 'Falta injustificada',
  FALTA_JUST: 'Falta justificada', ATESTADO: 'Atestado', FERIAS: 'Férias',
};
export const ABSENCE_TYPES: DayStatus[] = ['FALTA_INJUST', 'FALTA_JUST', 'ATESTADO', 'FERIAS'];

/* ───────── Datas (UTC ao meio-dia) ───────── */
export function dayUTC(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/* ───────── Geração do PLANEJADO ───────── */
export function plannedStatus(
  pattern: { scheduleType: ScheduleType; anchorDate: Date; customMask: string | null },
  date: Date,
): DayStatus {
  const dom = date.getUTCDate();
  switch (pattern.scheduleType) {
    case 'TWELVE36_ODD':
      return dom % 2 === 1 ? 'WORK' : 'OFF';
    case 'TWELVE36_EVEN':
      return dom % 2 === 0 ? 'WORK' : 'OFF';
    case 'SIX_ONE': {
      const pos = ((diffDays(date, pattern.anchorDate) % 7) + 7) % 7;
      return pos < 6 ? 'WORK' : 'OFF';
    }
    case 'FIVE_TWO': {
      const pos = ((diffDays(date, pattern.anchorDate) % 7) + 7) % 7;
      return pos < 5 ? 'WORK' : 'OFF';
    }
    case 'CUSTOM': {
      const mask = (pattern.customMask || 'T').toUpperCase().replace(/[^TF]/g, '') || 'T';
      const pos = ((diffDays(date, pattern.anchorDate) % mask.length) + mask.length) % mask.length;
      return mask[pos] === 'T' ? 'WORK' : 'OFF';
    }
  }
}

/* ───────── Montagem da grade do mês ───────── */
export interface ScheduleCell { planned: DayStatus; actual: DayStatus | null }
export interface ScheduleRow {
  collaboratorId: string;
  name: string;
  jobTitle: string | null;
  typeLabel: string;
  scheduleType: ScheduleType;
  shiftLabel: string | null;
  days: ScheduleCell[]; // índice 0 = dia 1
}
export interface ScheduleGrid {
  year: number; month: number; daysCount: number;
  rows: ScheduleRow[];
  withoutSchedule: { id: string; name: string }[];
}

export async function getScheduleGrid(unitId: string, year: number, month: number): Promise<ScheduleGrid> {
  const daysCount = daysInMonth(year, month);
  const first = dayUTC(year, month, 1);
  const last = dayUTC(year, month, daysCount);

  const [collabs, patterns, overrides, actuals] = await Promise.all([
    prisma.collaborator.findMany({ where: { active: true, units: { some: { unitId } } }, orderBy: { name: 'asc' }, select: { id: true, name: true, jobTitle: true } }),
    prisma.employeeSchedule.findMany({ where: { unitId, active: true }, include: { shift: true } }),
    prisma.schedulePlanOverride.findMany({ where: { unitId, date: { gte: first, lte: last } } }),
    prisma.scheduleActual.findMany({ where: { unitId, date: { gte: first, lte: last } } }),
  ]);

  const patternByCollab = new Map(patterns.map((p) => [p.collaboratorId, p]));
  const overrideMap = new Map<string, DayStatus>(); // key collab|dom
  for (const o of overrides) overrideMap.set(`${o.collaboratorId}|${o.date.getUTCDate()}`, o.status);
  const actualMap = new Map<string, DayStatus>();
  for (const a of actuals) actualMap.set(`${a.collaboratorId}|${a.date.getUTCDate()}`, a.status);

  const rows: ScheduleRow[] = [];
  const withoutSchedule: { id: string; name: string }[] = [];

  for (const c of collabs) {
    const p = patternByCollab.get(c.id);
    if (!p) { withoutSchedule.push({ id: c.id, name: c.name }); continue; }
    const days: ScheduleCell[] = [];
    for (let d = 1; d <= daysCount; d++) {
      const date = dayUTC(year, month, d);
      const planned = overrideMap.get(`${c.id}|${d}`) ?? plannedStatus(p, date);
      const actual = actualMap.get(`${c.id}|${d}`) ?? null;
      days.push({ planned, actual });
    }
    const shiftLabel = p.shift ? (p.shift.startTime && p.shift.endTime ? `${p.shift.startTime}-${p.shift.endTime}` : p.shift.name) : null;
    rows.push({ collaboratorId: c.id, name: c.name, jobTitle: c.jobTitle, typeLabel: TYPE_LABELS[p.scheduleType], scheduleType: p.scheduleType, shiftLabel, days });
  }

  // ordena por tipo de escala (agrupamento) depois por nome
  rows.sort((a, b) => a.typeLabel.localeCompare(b.typeLabel) || a.name.localeCompare(b.name));
  return { year, month, daysCount, rows, withoutSchedule };
}

/* ───────── Cadastro do padrão da escala ───────── */
export async function saveSchedulePattern(
  user: SessionUser,
  input: { collaboratorId: string; unitId: string; scheduleType: ScheduleType; anchorDate: string; shiftId?: string | null; customMask?: string | null },
  ctx: Ctx = {},
): Promise<SchedResult> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.collaboratorId || !input.scheduleType || !input.anchorDate) return { ok: false, reason: 'INVALID' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.anchorDate)) return { ok: false, reason: 'INVALID' };
  if (input.scheduleType === 'CUSTOM' && !(input.customMask || '').match(/[TF]/i)) return { ok: false, reason: 'INVALID' };
  const [y, m, d] = input.anchorDate.split('-').map(Number);
  const anchor = dayUTC(y, m, d);
  const data = {
    scheduleType: input.scheduleType,
    anchorDate: anchor,
    shiftId: input.shiftId || null,
    customMask: input.scheduleType === 'CUSTOM' ? (input.customMask || '').toUpperCase().replace(/[^TF]/g, '') : null,
    active: true,
  };
  const saved = await prisma.employeeSchedule.upsert({
    where: { collaboratorId_unitId: { collaboratorId: input.collaboratorId, unitId: input.unitId } },
    create: { collaboratorId: input.collaboratorId, unitId: input.unitId, ...data },
    update: data,
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'SCHEDULE_PATTERN_SAVE', module: 'SCHEDULE', entity: 'employee_schedule', entityId: saved.id, metadata: { type: input.scheduleType }, ...ctx });
  return { ok: true, id: saved.id };
}

export async function deleteSchedulePattern(user: SessionUser, collaboratorId: string, unitId: string, ctx: Ctx = {}): Promise<SchedResult> {
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.employeeSchedule.deleteMany({ where: { collaboratorId, unitId } });
  await audit({ userId: user.id, unitId, action: 'SCHEDULE_PATTERN_DELETE', module: 'SCHEDULE', entity: 'employee_schedule', entityId: collaboratorId, ...ctx });
  return { ok: true };
}

/* ───────── REALIZADO (única coisa editável) ───────── */
export async function setActual(
  user: SessionUser,
  input: { collaboratorId: string; unitId: string; date: string; status: DayStatus; note?: string },
  ctx: Ctx = {},
): Promise<SchedResult> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, reason: 'INVALID' };
  const [y, m, d] = input.date.split('-').map(Number);
  const date = dayUTC(y, m, d);
  await prisma.scheduleActual.upsert({
    where: { collaboratorId_date: { collaboratorId: input.collaboratorId, date } },
    create: { collaboratorId: input.collaboratorId, unitId: input.unitId, date, status: input.status, note: input.note?.trim() || null, createdById: user.id },
    update: { status: input.status, note: input.note?.trim() || null, createdById: user.id },
  });
  // Variação (≠ trabalho/folga) → aviso automático ao RH (registro local; API futura)
  if (input.status !== 'WORK' && input.status !== 'OFF') {
    await recordRhNotice(user, input.collaboratorId, input.unitId, [input.date], input.status).catch(() => {});
  }
  return { ok: true };
}

/** Registra aviso(s) ao RH de variação na escala (pacote 07/07 — relatório por período). */
async function recordRhNotice(user: SessionUser, collaboratorId: string, unitId: string, dates: string[], status: DayStatus): Promise<void> {
  const collab = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { name: true } });
  if (!collab) return;
  await prisma.rhScheduleNotice.createMany({
    data: dates.map((date) => ({
      unitId, collaboratorId, collaboratorName: collab.name, date,
      status: STATUS_LABEL[status] ?? String(status),
      createdById: user.id, createdByName: user.name,
    })),
  });
}

/** Registrar ausência num período (FI/FJ/A/FE) — preenche o Realizado. */
export async function registerAbsence(
  user: SessionUser,
  input: { collaboratorId: string; unitId: string; status: DayStatus; start: string; end: string; reason?: string; note?: string; attachmentPath?: string },
  ctx: Ctx = {},
): Promise<SchedResult> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!ABSENCE_TYPES.includes(input.status)) return { ok: false, reason: 'INVALID' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end)) return { ok: false, reason: 'INVALID' };
  const [ys, ms, ds] = input.start.split('-').map(Number);
  const [ye, me, de] = input.end.split('-').map(Number);
  const start = dayUTC(ys, ms, ds);
  const end = dayUTC(ye, me, de);
  if (end < start) return { ok: false, reason: 'INVALID' };

  for (let cur = new Date(start); cur <= end; cur = new Date(cur.getTime() + 86_400_000)) {
    const date = new Date(cur);
    await prisma.scheduleActual.upsert({
      where: { collaboratorId_date: { collaboratorId: input.collaboratorId, date } },
      create: { collaboratorId: input.collaboratorId, unitId: input.unitId, date, status: input.status, reason: input.reason?.trim() || null, note: input.note?.trim() || null, attachmentPath: input.attachmentPath || null, createdById: user.id },
      update: { status: input.status, reason: input.reason?.trim() || null, note: input.note?.trim() || null, ...(input.attachmentPath ? { attachmentPath: input.attachmentPath } : {}), createdById: user.id },
    });
  }
  await audit({ userId: user.id, unitId: input.unitId, action: 'SCHEDULE_ABSENCE', module: 'SCHEDULE', entity: 'collaborator', entityId: input.collaboratorId, metadata: { status: input.status, start: input.start, end: input.end }, ...ctx });
  // Ausência por período → um aviso ao RH por dia (registro local; API futura)
  {
    const dates: string[] = [];
    for (let cur = new Date(start); cur <= end; cur = new Date(cur.getTime() + 86_400_000)) dates.push(cur.toISOString().slice(0, 10));
    await recordRhNotice(user, input.collaboratorId, input.unitId, dates, input.status).catch(() => {});
  }
  return { ok: true };
}

/** Limpa o Realizado de um dia (volta a vazio). */
export async function clearActual(user: SessionUser, collaboratorId: string, unitId: string, date: string, ctx: Ctx = {}): Promise<SchedResult> {
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, reason: 'INVALID' };
  const [y, m, d] = date.split('-').map(Number);
  await prisma.scheduleActual.deleteMany({ where: { collaboratorId, date: dayUTC(y, m, d) } });
  return { ok: true };
}

/**
 * Preenche o Realizado a partir do Planejado para o mês inteiro.
 * mode 'empty' = só onde ainda não há realizado · 'all' = sobrescreve tudo.
 */
export async function fillActualFromPlan(
  user: SessionUser,
  input: { unitId: string; year: number; month: number; mode: 'empty' | 'all' },
  ctx: Ctx = {},
): Promise<SchedResult & { filled?: number }> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const grid = await getScheduleGrid(input.unitId, input.year, input.month);
  let filled = 0;
  for (const row of grid.rows) {
    for (let i = 0; i < row.days.length; i++) {
      const cell = row.days[i];
      if (input.mode === 'empty' && cell.actual !== null) continue;
      const date = dayUTC(input.year, input.month, i + 1);
      await prisma.scheduleActual.upsert({
        where: { collaboratorId_date: { collaboratorId: row.collaboratorId, date } },
        create: { collaboratorId: row.collaboratorId, unitId: input.unitId, date, status: cell.planned, createdById: user.id },
        update: { status: cell.planned, createdById: user.id },
      });
      filled++;
    }
  }
  await audit({ userId: user.id, unitId: input.unitId, action: 'SCHEDULE_FILL', module: 'SCHEDULE', metadata: { year: input.year, month: input.month, mode: input.mode, filled }, ...ctx });
  return { ok: true, filled };
}

/** Disponibilidade no Mapa de Funções: quem está de Trabalho (planejado) num dia. */
export async function availabilityForDate(unitId: string, dateISO: string): Promise<{ working: string[]; off: string[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { working: [], off: [] };
  const [y, m, d] = dateISO.split('-').map(Number);
  const grid = await getScheduleGrid(unitId, y, m);
  const working: string[] = []; const off: string[] = [];
  for (const row of grid.rows) {
    const cell = row.days[d - 1];
    if (!cell) continue;
    // considera o realizado se houver, senão o planejado
    const status = cell.actual ?? cell.planned;
    if (status === 'WORK') working.push(row.name);
    else off.push(`${row.name} (${STATUS_CODE[status]})`);
  }
  return { working, off };
}
