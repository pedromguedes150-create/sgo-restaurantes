import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { TrainingStatus } from '@prisma/client';

/**
 * Treinamentos via POPs (conta na meta do gerente).
 * - POP inicial → todo colaborador da unidade. POP setorial → colaboradores do setor.
 * - Recorrência ONCE (periodKey "V{versão}", re-treina ao mudar de versão) ·
 *   MONTHLY (periodKey "AAAA-MM", reciclagem mensal).
 * - Prazo: ONCE = 7 dias a partir da geração · MONTHLY = fim do mês.
 * - reconcileTrainingForUnit é IDEMPOTENTE: cria pendências que faltam, remove
 *   pendências que não se aplicam mais (mudança de setor) e marca vencidas.
 */

const WEIGHT_KEY = 'TRAINING_META_WEIGHT';
const DEFAULT_WEIGHT = 15;

export async function getTrainingWeight(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: WEIGHT_KEY } });
  const n = s ? Number(s.value) : DEFAULT_WEIGHT;
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : DEFAULT_WEIGHT;
}
export async function setTrainingWeight(user: SessionUser, weight: number) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  const w = Math.max(0, Math.trunc(weight));
  await prisma.appSetting.upsert({ where: { key: WEIGHT_KEY }, create: { key: WEIGHT_KEY, value: String(w) }, update: { value: String(w) } });
  await audit({ userId: user.id, action: 'TRAINING_WEIGHT_SET', module: 'CONFIG', metadata: { weight: w } });
  return { ok: true as const };
}

function endOfMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59));
}
function ym(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Reconciliação idempotente das pendências de treinamento de uma unidade. */
export async function reconcileTrainingForUnit(unitId: string): Promise<void> {
  const now = new Date();
  const month = ym(now);
  const dueOnce = new Date(now.getTime() + 7 * 86_400_000);
  const dueMonthly = endOfMonth(now);

  const pops = await prisma.pop.findMany({
    where: { status: 'PUBLISHED', units: { some: { unitId } }, OR: [{ isInitial: true }, { sectors: { some: {} } }] },
    select: { id: true, version: true, isInitial: true, recurrence: true, sectors: { select: { sectorName: true } } },
  });
  if (pops.length === 0) {
    // ainda assim marca vencidas
    await prisma.trainingRecord.updateMany({ where: { unitId, status: 'PENDING', dueDate: { lt: now } }, data: { status: 'MISSED' } });
    return;
  }

  const links = await prisma.collaboratorUnit.findMany({ where: { unitId, collaborator: { active: true } }, select: { collaboratorId: true } });
  const allocations = await prisma.workforceAllocation.findMany({ where: { unitId }, select: { collaboratorId: true, sector: { select: { name: true } } } });
  const sectorsByCollab = new Map<string, Set<string>>();
  for (const a of allocations) {
    if (!a.collaboratorId) continue;
    const set = sectorsByCollab.get(a.collaboratorId) ?? new Set<string>();
    if (a.sector?.name) set.add(a.sector.name);
    sectorsByCollab.set(a.collaboratorId, set);
  }

  for (const link of links) {
    const collabSectors = sectorsByCollab.get(link.collaboratorId) ?? new Set<string>();
    // chaves requeridas: popId|periodKey -> { sectorName }
    const required = new Map<string, { popId: string; version: number; periodKey: string; sectorName: string | null; due: Date }>();
    for (const p of pops) {
      const isSetorialMatch = p.sectors.some((s) => collabSectors.has(s.sectorName));
      const applies = p.isInitial || isSetorialMatch;
      if (!applies) continue;
      const sectorName = p.isInitial ? null : (p.sectors.find((s) => collabSectors.has(s.sectorName))?.sectorName ?? null);
      const periodKey = p.recurrence === 'MONTHLY' ? month : `V${p.version}`;
      const due = p.recurrence === 'MONTHLY' ? dueMonthly : dueOnce;
      required.set(`${p.id}|${periodKey}`, { popId: p.id, version: p.version, periodKey, sectorName, due });
    }

    // cria as que faltam
    for (const r of required.values()) {
      await prisma.trainingRecord.upsert({
        where: { popId_collaboratorId_periodKey: { popId: r.popId, collaboratorId: link.collaboratorId, periodKey: r.periodKey } },
        create: { popId: r.popId, popVersion: r.version, collaboratorId: link.collaboratorId, unitId, sectorName: r.sectorName, periodKey: r.periodKey, status: 'PENDING', dueDate: r.due },
        update: {}, // não mexe em registros já existentes (preserva DONE/MISSED e prazos)
      });
    }

    // remove pendências que não se aplicam mais (ex.: saiu do setor). Mantém DONE/MISSED.
    const existing = await prisma.trainingRecord.findMany({ where: { collaboratorId: link.collaboratorId, unitId, status: 'PENDING' }, select: { id: true, popId: true, periodKey: true } });
    for (const e of existing) {
      if (!required.has(`${e.popId}|${e.periodKey}`)) {
        await prisma.trainingRecord.delete({ where: { id: e.id } }).catch(() => {});
      }
    }
  }

  // marca vencidas
  await prisma.trainingRecord.updateMany({ where: { unitId, status: 'PENDING', dueDate: { lt: now } }, data: { status: 'MISSED' } });
}

/** Reconciliação em todas as unidades (scheduler). */
export async function reconcileAllTraining(): Promise<void> {
  const units = await prisma.unit.findMany({ where: { active: true }, select: { id: true } });
  for (const u of units) await reconcileTrainingForUnit(u.id);
}

/* ───────── Board do gerente (por setor) ───────── */
export interface TrainingItem { recordId: string; popId: string; popTitle: string; status: TrainingStatus; dueDate: string; periodKey: string }
export interface TrainingCollab { collaboratorId: string; name: string; pending: number; done: number; missed: number; items: TrainingItem[] }
export interface TrainingSectorGroup { sector: string; coverage: 'ok' | 'partial' | 'none'; collaborators: TrainingCollab[] }

export async function getTrainingBoard(unitId: string): Promise<TrainingSectorGroup[]> {
  await reconcileTrainingForUnit(unitId); // sempre fresco ao abrir
  const records = await prisma.trainingRecord.findMany({
    where: { unitId },
    include: { pop: { select: { title: true } }, collaborator: { select: { name: true, active: true } } },
    orderBy: { dueDate: 'asc' },
  });

  // agrupa por setor (null = "Iniciais"); colaborador aparece no(s) seu(s) grupo(s)
  const groups = new Map<string, Map<string, TrainingCollab>>();
  for (const r of records) {
    if (!r.collaborator.active) continue;
    const sector = r.sectorName ?? 'Treinamentos iniciais';
    const byCollab = groups.get(sector) ?? new Map<string, TrainingCollab>();
    const c = byCollab.get(r.collaboratorId) ?? { collaboratorId: r.collaboratorId, name: r.collaborator.name, pending: 0, done: 0, missed: 0, items: [] };
    if (r.status === 'PENDING') c.pending++; else if (r.status === 'DONE') c.done++; else c.missed++;
    c.items.push({ recordId: r.id, popId: r.popId, popTitle: r.pop.title, status: r.status, dueDate: r.dueDate.toISOString().slice(0, 10), periodKey: r.periodKey });
    byCollab.set(r.collaboratorId, c);
    groups.set(sector, byCollab);
  }

  const out: TrainingSectorGroup[] = [];
  for (const [sector, byCollab] of groups) {
    const collaborators = [...byCollab.values()].sort((a, b) => a.name.localeCompare(b.name));
    const anyMissed = collaborators.some((c) => c.missed > 0);
    const anyPending = collaborators.some((c) => c.pending > 0);
    const coverage: TrainingSectorGroup['coverage'] = anyMissed ? 'none' : anyPending ? 'partial' : 'ok';
    out.push({ sector, coverage, collaborators });
  }
  // "Iniciais" primeiro, depois setores em ordem alfabética
  return out.sort((a, b) => (a.sector === 'Treinamentos iniciais' ? -1 : b.sector === 'Treinamentos iniciais' ? 1 : a.sector.localeCompare(b.sector)));
}

export type TrainResult = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'NOT_FOUND' };

/** Gerente marca um treinamento como realizado. */
export async function completeTraining(user: SessionUser, recordId: string, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<TrainResult> {
  const rec = await prisma.trainingRecord.findUnique({ where: { id: recordId }, select: { unitId: true, popId: true, collaboratorId: true } });
  if (!rec) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, rec.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.trainingRecord.update({ where: { id: recordId }, data: { status: 'DONE', completedAt: new Date(), completedById: user.id } });
  await audit({ userId: user.id, unitId: rec.unitId, action: 'TRAINING_DONE', module: 'POPS', entity: 'training_record', entityId: recordId, metadata: { popId: rec.popId, collaboratorId: rec.collaboratorId }, ...ctx });
  return { ok: true };
}

/** Reabrir (desfazer) um treinamento marcado — volta a pendente. */
export async function reopenTraining(user: SessionUser, recordId: string, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<TrainResult> {
  const rec = await prisma.trainingRecord.findUnique({ where: { id: recordId }, select: { unitId: true, dueDate: true } });
  if (!rec) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, rec.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const status: TrainingStatus = rec.dueDate < new Date() ? 'MISSED' : 'PENDING';
  await prisma.trainingRecord.update({ where: { id: recordId }, data: { status, completedAt: null, completedById: null } });
  await audit({ userId: user.id, unitId: rec.unitId, action: 'TRAINING_REOPEN', module: 'POPS', entity: 'training_record', entityId: recordId, ...ctx });
  return { ok: true };
}

/* ───────── Integração com a META ───────── */
/** Estatística do mês: realizados no mês (completedAt) e vencidos no mês (dueDate). */
export async function getTrainingMonthStats(unitId: string, yearMonth: string): Promise<{ done: number; missed: number }> {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const [done, missed] = await Promise.all([
    prisma.trainingRecord.count({ where: { unitId, status: 'DONE', completedAt: { gte: start, lt: end } } }),
    prisma.trainingRecord.count({ where: { unitId, status: 'MISSED', dueDate: { gte: start, lt: end } } }),
  ]);
  return { done, missed };
}
