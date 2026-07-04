import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { DayType } from '@prisma/client';

/** Minutos entre duas horas HH:MM (vira a meia-noite se fim < início). */
function hoursBetween(start: string, end: string): number {
  const m = (s: string) => { const x = /^(\d{1,2}):(\d{2})$/.exec(s.trim()); return x ? Number(x[1]) * 60 + Number(x[2]) : null; };
  const a = m(start), b = m(end);
  if (a == null || b == null) return 0;
  const diff = b >= a ? b - a : b + 24 * 60 - a;
  return Math.round((diff / 60) * 100) / 100;
}

/** Tipo de dia de uma data (yyyy-mm-dd): feriado > fim de semana > dia útil. */
export async function resolveDayType(dateISO: string): Promise<DayType> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return 'WEEKDAY';
  const holiday = await prisma.holiday.findUnique({ where: { date: dateISO }, select: { id: true } });
  if (holiday) return 'HOLIDAY';
  const [y, m, d] = dateISO.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 || wd === 6 ? 'WEEKEND' : 'WEEKDAY';
}

export const DAY_TYPE_LABEL: Record<DayType, string> = { WEEKDAY: 'Dia útil', WEEKEND: 'Fim de semana', HOLIDAY: 'Feriado' };

/** Valor/hora cadastrado para a unidade no tipo de dia (ou null se não houver). */
export async function getHourlyRate(unitId: string, dayType: DayType): Promise<number | null> {
  const r = await prisma.freelancerHourlyRate.findUnique({ where: { unitId_dayType: { unitId, dayType } }, select: { value: true } });
  return r ? Number(r.value) : null;
}

export interface FreelancerCalc {
  configured: boolean; // há valor/hora cadastrado p/ a unidade+tipo de dia
  dayType: DayType;
  hours: number;
  rate: number | null;
  transport: number;
  amount: number; // horas×valor + vale transporte (0 se não configurado)
}
/** Calcula o valor do freelancer: horas × valor/hora do dia + vale transporte. */
export async function computeFreelancerAmount(input: { unitId: string; dateISO: string; start: string; end: string; transport?: number }): Promise<FreelancerCalc> {
  const dayType = await resolveDayType(input.dateISO);
  const rate = await getHourlyRate(input.unitId, dayType);
  const hours = hoursBetween(input.start, input.end);
  const transport = input.transport && input.transport > 0 ? Number(input.transport) : 0;
  const amount = rate != null ? Math.round((hours * rate + transport) * 100) / 100 : 0;
  return { configured: rate != null, dayType, hours, rate, transport, amount };
}

/* ───────── Config (Admin): valor/hora por unidade × tipo de dia ───────── */
export async function listRatesByUnit(): Promise<Record<string, Partial<Record<DayType, number>>>> {
  const rows = await prisma.freelancerHourlyRate.findMany();
  const out: Record<string, Partial<Record<DayType, number>>> = {};
  for (const r of rows) { (out[r.unitId] ??= {})[r.dayType] = Number(r.value); }
  return out;
}
export async function setHourlyRate(user: SessionUser, unitId: string, dayType: DayType, value: number, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  if (!unitId || !['WEEKDAY', 'WEEKEND', 'HOLIDAY'].includes(dayType)) return { ok: false as const, reason: 'INVALID' as const };
  const v = Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
  await prisma.freelancerHourlyRate.upsert({ where: { unitId_dayType: { unitId, dayType } }, create: { unitId, dayType, value: v }, update: { value: v } });
  await audit({ userId: user.id, unitId, action: 'FREELANCER_RATE_SET', module: 'CONFIG', metadata: { dayType, value: v }, ...ctx });
  return { ok: true as const };
}

/* ───────── Config (Admin): feriados ───────── */
export async function listHolidays() {
  return prisma.holiday.findMany({ orderBy: { date: 'asc' } });
}
export async function addHoliday(user: SessionUser, date: string, name: string, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name?.trim()) return { ok: false as const, reason: 'INVALID' as const };
  await prisma.holiday.upsert({ where: { date }, create: { date, name: name.trim() }, update: { name: name.trim() } });
  await audit({ userId: user.id, action: 'HOLIDAY_ADD', module: 'CONFIG', metadata: { date, name }, ...ctx });
  return { ok: true as const };
}
export async function deleteHoliday(user: SessionUser, id: string, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  await prisma.holiday.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, action: 'HOLIDAY_DELETE', module: 'CONFIG', entity: 'holiday', entityId: id, ...ctx });
  return { ok: true as const };
}
