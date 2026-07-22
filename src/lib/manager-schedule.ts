import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { notifyUnitRole, notifyRole } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

/** Padrão semanal de trabalho do gerente (dias 0=dom..6=sáb + horário). */
export interface WorkScheduleDTO { weekdays: number[]; startTime: string | null; endTime: string | null; note: string | null }

function parseWeekdays(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
}

export async function getMyWorkSchedule(userId: string): Promise<WorkScheduleDTO | null> {
  const s = await prisma.managerWorkSchedule.findUnique({ where: { userId } });
  if (!s) return null;
  return { weekdays: parseWeekdays(s.weekdays), startTime: s.startTime, endTime: s.endTime, note: s.note };
}

export async function setMyWorkSchedule(user: SessionUser, input: { weekdays: number[]; startTime?: string | null; endTime?: string | null; note?: string | null }) {
  const weekdays = parseWeekdays(input.weekdays);
  const time = (t?: string | null) => (t && /^\d{2}:\d{2}$/.test(t) ? t : null);
  const data = { weekdays, startTime: time(input.startTime), endTime: time(input.endTime), note: input.note?.trim() || null };
  await prisma.managerWorkSchedule.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  return { ok: true as const };
}

/**
 * Admin cadastra/edita o horário de QUALQUER gerente (20/07 — pedido do Pedro).
 * Restrito a ADMIN/CEO. Audita a alteração.
 */
export async function setManagerWorkSchedule(actor: SessionUser, targetUserId: string, input: { weekdays: number[]; startTime?: string | null; endTime?: string | null; note?: string | null }) {
  if (!['ADMIN', 'CEO'].includes(actor.role)) return { ok: false as const, reason: 'FORBIDDEN' as const };
  if (!targetUserId) return { ok: false as const, reason: 'INVALID' as const };
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, name: true, role: true } });
  if (!target || !['MANAGER', 'COORDINATOR'].includes(target.role)) return { ok: false as const, reason: 'INVALID' as const };
  const weekdays = parseWeekdays(input.weekdays);
  const time = (t?: string | null) => (t && /^\d{2}:\d{2}$/.test(t) ? t : null);
  const data = { weekdays, startTime: time(input.startTime), endTime: time(input.endTime), note: input.note?.trim() || null };
  await prisma.managerWorkSchedule.upsert({ where: { userId: targetUserId }, create: { userId: targetUserId, ...data }, update: data });
  const { audit } = await import('@/lib/audit');
  await audit({ userId: actor.id, action: 'MANAGER_SCHEDULE_SET', module: 'PEOPLE', entity: 'manager_work_schedule', entityId: targetUserId, metadata: { manager: target.name, weekdays, startTime: data.startTime, endTime: data.endTime } });
  return { ok: true as const };
}

const WD_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export { WD_LABEL };

/** Dias do mês (1..N) e o weekday de cada um. */
function daysOfMonth(year: number, month: number): { day: number; weekday: number; iso: string }[] {
  const n = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out: { day: number; weekday: number; iso: string }[] = [];
  for (let d = 1; d <= n; d++) {
    const dt = new Date(Date.UTC(year, month - 1, d));
    out.push({ day: d, weekday: dt.getUTCDay(), iso: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }
  return out;
}

export interface CalManager { userId: string; name: string; hasSchedule: boolean; weekdays: number[]; time: string | null; startTime: string | null; endTime: string | null; note: string | null }
export interface CalDay { day: number; weekday: number; iso: string; working: string[]; onLeave: { name: string; kind: string }[]; gap: boolean }
export interface CalUnit { unitId: string; unitName: string; managers: CalManager[]; days: CalDay[]; gapDays: number; noScheduleCount: number }
export interface ManagerCalendar { year: number; month: number; firstWeekday: number; units: CalUnit[] }

/**
 * Calendário consolidado de gerência (20/07): para cada unidade em escopo, quais
 * gerentes trabalham em cada dia do mês (padrão semanal − folgas/férias). Dia sem
 * nenhum gerente = "buraco de gerência" (gap) para o supervisor realocar reserva.
 */
export async function getManagerCoverageCalendar(user: SessionUser, year: number, month: number): Promise<ManagerCalendar> {
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const days = daysOfMonth(year, month);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = days[days.length - 1]?.iso ?? monthStart;

  // Gerentes (e coordenadores) das unidades em escopo, com horário e folgas do mês
  const managers = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: ['MANAGER', 'COORDINATOR'] },
      memberships: { some: { unit: { id: { in: units.map((u) => u.id) } } } },
    },
    select: {
      id: true, name: true,
      memberships: { select: { unitId: true } },
      managerWorkSchedule: true,
      managerLeaves: { where: { startDate: { lte: monthEnd }, endDate: { gte: monthStart } }, select: { kind: true, startDate: true, endDate: true } },
    },
  });

  const unitsOut: CalUnit[] = units.map((u) => {
    const unitManagers = managers.filter((m) => m.memberships.some((mm) => mm.unitId === u.id));
    const calManagers: CalManager[] = unitManagers.map((m) => {
      const wd = parseWeekdays(m.managerWorkSchedule?.weekdays);
      const st = m.managerWorkSchedule?.startTime ?? null; const en = m.managerWorkSchedule?.endTime ?? null;
      return { userId: m.id, name: m.name, hasSchedule: Boolean(m.managerWorkSchedule) && wd.length > 0, weekdays: wd, time: st || en ? `${st ?? ''}${st || en ? '–' : ''}${en ?? ''}` : null, startTime: st, endTime: en, note: m.managerWorkSchedule?.note ?? null };
    });
    const calDays: CalDay[] = days.map((d) => {
      const working: string[] = [];
      const onLeave: { name: string; kind: string }[] = [];
      for (const m of unitManagers) {
        const leave = m.managerLeaves.find((l) => l.startDate <= d.iso && l.endDate >= d.iso);
        if (leave) { onLeave.push({ name: m.name, kind: leave.kind }); continue; }
        const wd = parseWeekdays(m.managerWorkSchedule?.weekdays);
        if (wd.includes(d.weekday)) working.push(m.name);
      }
      const anySchedule = calManagers.some((m) => m.hasSchedule);
      return { day: d.day, weekday: d.weekday, iso: d.iso, working, onLeave, gap: anySchedule && working.length === 0 };
    });
    return {
      unitId: u.id, unitName: u.name, managers: calManagers, days: calDays,
      gapDays: calDays.filter((d) => d.gap).length,
      noScheduleCount: calManagers.filter((m) => !m.hasSchedule).length,
    };
  });

  return { year, month, firstWeekday: new Date(Date.UTC(year, month - 1, 1)).getUTCDay(), units: unitsOut };
}

/**
 * Alerta ao supervisor quando um gerente NÃO lança folga há mais de 7 dias
 * (regra do Pedro, 20/07). Anti-spam: não repete o alerta do mesmo gerente
 * antes de 7 dias (lastFolgaAlertAt). Roda 1x/dia no scheduler.
 */
export async function notifyManagersWithoutRecentFolga(now: Date = new Date()): Promise<{ notified: number }> {
  const sevenAgoISO = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const todayISO = now.toISOString().slice(0, 10);
  const managers = await prisma.user.findMany({
    where: { active: true, role: { in: ['MANAGER', 'COORDINATOR'] } },
    select: {
      id: true, name: true,
      memberships: { select: { unitId: true } },
      managerWorkSchedule: { select: { lastFolgaAlertAt: true } },
      // folgas que cobrem qualquer dia dos últimos 7 dias
      managerLeaves: { where: { kind: 'FOLGA', endDate: { gte: sevenAgoISO }, startDate: { lte: todayISO } }, select: { id: true }, take: 1 },
    },
  });

  let notified = 0;
  for (const m of managers) {
    if (m.managerLeaves.length > 0) continue; // teve folga nos últimos 7 dias
    const last = m.managerWorkSchedule?.lastFolgaAlertAt;
    if (last && now.getTime() - last.getTime() < 7 * 86400000) continue; // já avisado há < 7 dias
    const unitIds = m.memberships.map((x) => x.unitId);
    const payload = {
      title: '⚠ Gerente sem folga lançada há 7+ dias',
      body: `${m.name} não registrou folga nos últimos 7 dias. Confira a escala de gerência.`,
      link: '/modulos/folgas-equipe',
      module: 'PEOPLE',
    };
    if (unitIds.length > 0) { for (const uid of unitIds) await notifyUnitRole(uid, 'SUPERVISOR', payload); }
    else await notifyRole('SUPERVISOR', payload);
    await prisma.managerWorkSchedule.upsert({
      where: { userId: m.id },
      create: { userId: m.id, weekdays: [], lastFolgaAlertAt: now },
      update: { lastFolgaAlertAt: now },
    });
    notified++;
  }
  return { notified };
}
