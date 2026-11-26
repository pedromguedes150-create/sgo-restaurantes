import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { DayType } from '@prisma/client';
import { horasEntre } from '@/lib/overtime/calculo';

/** Horas entre HH:MM (vira a meia-noite se fim < início). A conta mora em `overtime/calculo.ts`, compartilhada com a Hora Extra (v1.130.0). */
const hoursBetween = horasEntre;

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
  /** O valor/hora USADO na conta (o padrão ou o autorizado que foi escolhido). */
  rate: number | null;
  transport: number;
  amount: number; // horas×valor + vale transporte (0 se não configurado)
  /** v1.226.0 — o valor/hora PADRÃO da unidade no tipo de dia. */
  standardRate: number | null;
  /** Quanto daria pelo padrão (para mostrar a diferença quando outro valor é escolhido). */
  standardAmount: number;
  /** O padrão + os alternativos autorizados e ativos, do menor para o maior. */
  opcoes: number[];
  /** Pediram um valor/hora que não está autorizado para a unidade nesse tipo de dia. */
  rateRecusado: boolean;
}

const centavos = (n: number) => Math.round(n * 100);

/**
 * Qual valor/hora vale (PURA). Sem pedido, o padrão. Pedido que está na lista
 * autorizada vale; o já GRAVADO na solicitação vale sempre (pode ter sido
 * desativado depois — o aprovador não pode ser travado por isso). Fora disso é
 * recusado, e a conta volta ao padrão.
 */
export function escolherValorHora(padrao: number, alternativos: number[], pedido?: number | null, gravado?: number | null): { rate: number; opcoes: number[]; recusado: boolean } {
  const opcoes = [...new Set([padrao, ...alternativos].filter((v) => v > 0).map(centavos))].sort((a, b) => a - b).map((c) => c / 100);
  if (pedido == null || !(Number(pedido) > 0)) return { rate: padrao, opcoes, recusado: false };
  const c = centavos(Number(pedido));
  const autorizado = opcoes.some((v) => centavos(v) === c) || (gravado != null && centavos(Number(gravado)) === c);
  return autorizado ? { rate: c / 100, opcoes, recusado: false } : { rate: padrao, opcoes, recusado: true };
}

/** Os valores/hora alternativos ATIVOS da unidade no tipo de dia. */
export async function alternativosAtivos(unitId: string, dayType: DayType): Promise<number[]> {
  const rows = await prisma.freelancerAltRate.findMany({ where: { unitId, dayType, active: true }, select: { value: true } });
  return rows.map((r) => Number(r.value));
}
/** Calcula o valor do freelancer: horas × valor/hora do dia + vale transporte. */
export async function computeFreelancerAmount(input: { unitId: string; dateISO: string; start: string; end: string; transport?: number; rate?: number | null; rateGravado?: number | null }): Promise<FreelancerCalc> {
  const dayType = await resolveDayType(input.dateISO);
  const padrao = await getHourlyRate(input.unitId, dayType);
  const hours = hoursBetween(input.start, input.end);
  const transport = input.transport && input.transport > 0 ? Number(input.transport) : 0;
  if (padrao == null) return { configured: false, dayType, hours, rate: null, transport, amount: 0, standardRate: null, standardAmount: 0, opcoes: [], rateRecusado: false };
  /* v1.226.0 — o valor/hora pode ser outro, desde que AUTORIZADO para a unidade
     nesse tipo de dia. A escolha é conferida aqui, no servidor. */
  const e = escolherValorHora(padrao, await alternativosAtivos(input.unitId, dayType), input.rate, input.rateGravado);
  const conta = (r: number) => Math.round((hours * r + transport) * 100) / 100;
  return { configured: true, dayType, hours, rate: e.rate, transport, amount: conta(e.rate), standardRate: padrao, standardAmount: conta(padrao), opcoes: e.opcoes, rateRecusado: e.recusado };
}

/* ───────── Config (Admin): valores/hora alternativos autorizados ───────── */
export interface AltRateDTO { id: string; value: number; active: boolean }

export async function listAltRatesByUnit(): Promise<Record<string, Partial<Record<DayType, AltRateDTO[]>>>> {
  const rows = await prisma.freelancerAltRate.findMany({ orderBy: { value: 'asc' } });
  const out: Record<string, Partial<Record<DayType, AltRateDTO[]>>> = {};
  for (const r of rows) ((out[r.unitId] ??= {})[r.dayType] ??= []).push({ id: r.id, value: Number(r.value), active: r.active });
  return out;
}

type AltResult = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'CONFLICT'; message?: string };

export async function addAltRate(user: SessionUser, unitId: string, dayType: DayType, value: number, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<AltResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const v = Math.round((Number(value) || 0) * 100) / 100;
  if (!unitId || !['WEEKDAY', 'WEEKEND', 'HOLIDAY'].includes(dayType) || !(v > 0) || v > 500) return { ok: false, reason: 'INVALID', message: 'Informe um valor por hora entre R$ 0,01 e R$ 500,00.' };
  const padrao = await getHourlyRate(unitId, dayType);
  if (padrao != null && centavos(padrao) === centavos(v)) return { ok: false, reason: 'CONFLICT', message: 'Esse já é o valor padrão deste tipo de dia.' };
  const existe = await prisma.freelancerAltRate.findUnique({ where: { unitId_dayType_value: { unitId, dayType, value: v } }, select: { id: true, active: true } });
  if (existe?.active) return { ok: false, reason: 'CONFLICT', message: 'Esse valor já está autorizado.' };
  if (existe) await prisma.freelancerAltRate.update({ where: { id: existe.id }, data: { active: true } });
  else await prisma.freelancerAltRate.create({ data: { unitId, dayType, value: v } });
  await audit({ userId: user.id, unitId, action: 'FREELANCER_ALT_RATE_ADD', module: 'CONFIG', metadata: { dayType, value: v }, ...ctx });
  return { ok: true };
}

/** Tira o valor da lista. A solicitação que já o usou não muda: o valor está congelado nela. */
export async function removeAltRate(user: SessionUser, id: string, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<AltResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const r = await prisma.freelancerAltRate.findUnique({ where: { id } });
  if (!r) return { ok: false, reason: 'INVALID', message: 'Valor não encontrado.' };
  await prisma.freelancerAltRate.delete({ where: { id } });
  await audit({ userId: user.id, unitId: r.unitId, action: 'FREELANCER_ALT_RATE_REMOVE', module: 'CONFIG', metadata: { dayType: r.dayType, value: Number(r.value) }, ...ctx });
  return { ok: true };
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
