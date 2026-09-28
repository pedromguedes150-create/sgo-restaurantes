import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

type Ctx = { ip?: string | null; userAgent?: string | null };
type Resultado = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'CONFLICT'; message?: string };

/**
 * VALORES DE HORA EXTRA POR UNIDADE (v1.130.0) — configuração do Admin,
 * espelho de "Valor do freelancer (por hora)", só que SEM tipo de dia: é a
 * lista dos valores combinados que o gerente pode escolher.
 */

export interface OvertimeRateRow { id: string; unitId: string; value: number; active: boolean }

export async function listOvertimeRatesByUnit(): Promise<Record<string, OvertimeRateRow[]>> {
  const rows = await prisma.overtimeHourlyRate.findMany({ orderBy: { value: 'asc' } });
  const out: Record<string, OvertimeRateRow[]> = {};
  for (const r of rows) (out[r.unitId] ??= []).push({ id: r.id, unitId: r.unitId, value: Number(r.value), active: r.active });
  return out;
}

/** Os valores que o gerente pode escolher, por unidade — só os ATIVOS, crescentes. */
export async function activeOvertimeRatesByUnit(unitIds: string[]): Promise<Record<string, number[]>> {
  if (unitIds.length === 0) return {};
  const rows = await prisma.overtimeHourlyRate.findMany({ where: { unitId: { in: unitIds }, active: true }, orderBy: { value: 'asc' }, select: { unitId: true, value: true } });
  const out: Record<string, number[]> = {};
  for (const r of rows) (out[r.unitId] ??= []).push(Number(r.value));
  return out;
}

/** O valor está autorizado (ativo) nesta unidade? É o que barra o valor digitado por fora da tela. */
export async function overtimeRateAllowed(unitId: string, value: number): Promise<boolean> {
  const v = Math.round((Number(value) || 0) * 100) / 100;
  if (!(v > 0)) return false;
  const r = await prisma.overtimeHourlyRate.findUnique({ where: { unitId_value: { unitId, value: v } }, select: { active: true } });
  return Boolean(r?.active);
}

export async function addOvertimeRate(user: SessionUser, unitId: string, value: number, ctx: Ctx = {}): Promise<Resultado> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const v = Math.round((Number(value) || 0) * 100) / 100;
  if (!unitId || !(v > 0) || v > 1000) return { ok: false, reason: 'INVALID', message: 'Informe um valor/hora entre R$ 0,01 e R$ 1.000,00.' };
  const existe = await prisma.overtimeHourlyRate.findUnique({ where: { unitId_value: { unitId, value: v } } });
  if (existe) {
    if (existe.active) return { ok: false, reason: 'CONFLICT', message: 'Este valor já está cadastrado nesta unidade.' };
    await prisma.overtimeHourlyRate.update({ where: { id: existe.id }, data: { active: true } });
  } else {
    await prisma.overtimeHourlyRate.create({ data: { unitId, value: v } });
  }
  await audit({ userId: user.id, unitId, action: 'OVERTIME_RATE_ADD', module: 'CONFIG', metadata: { value: v }, ...ctx });
  return { ok: true };
}

export async function toggleOvertimeRate(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<Resultado> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const r = await prisma.overtimeHourlyRate.findUnique({ where: { id } });
  if (!r) return { ok: false, reason: 'INVALID' };
  await prisma.overtimeHourlyRate.update({ where: { id }, data: { active: Boolean(active) } });
  await audit({ userId: user.id, unitId: r.unitId, action: 'OVERTIME_RATE_TOGGLE', module: 'CONFIG', metadata: { value: Number(r.value), active: Boolean(active) }, ...ctx });
  return { ok: true };
}

/** Apagar é seguro: a solicitação guarda o valor usado (snapshot), não a linha. */
export async function deleteOvertimeRate(user: SessionUser, id: string, ctx: Ctx = {}): Promise<Resultado> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const r = await prisma.overtimeHourlyRate.findUnique({ where: { id } });
  if (!r) return { ok: false, reason: 'INVALID' };
  await prisma.overtimeHourlyRate.delete({ where: { id } });
  await audit({ userId: user.id, unitId: r.unitId, action: 'OVERTIME_RATE_DELETE', module: 'CONFIG', metadata: { value: Number(r.value) }, ...ctx });
  return { ok: true };
}
