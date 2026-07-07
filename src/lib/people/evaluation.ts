import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Avaliação do colaborador (item 13, Onda 3):
 *  - Observações do dia a dia (texto livre, não altera o cadastro do RH).
 *  - Avaliação mensal (1 por colaborador/mês) com 4 critérios 1–5 + comentário.
 * Conta na META como componente único "Avaliações da equipe" com peso
 * configurável (EVALUATION_META_WEIGHT, padrão 0 = desligado — decisão do
 * Pedro em 07/07: só entra na nota quando o Admin ligar em Config).
 */
const WEIGHT_KEY = 'EVALUATION_META_WEIGHT';
const DEFAULT_WEIGHT = 0;

type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

const CRITERIA = ['punctuality', 'performance', 'teamwork', 'presentation'] as const;
export type EvaluationCriteria = Record<(typeof CRITERIA)[number], number>;

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ===== Peso na meta ==========================================================

export async function getEvaluationWeight(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: WEIGHT_KEY } });
  const n = s ? Number(s.value) : DEFAULT_WEIGHT;
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : DEFAULT_WEIGHT;
}

export async function setEvaluationWeight(user: SessionUser, weight: number) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  const w = Math.max(0, Math.trunc(weight));
  if (!Number.isFinite(w)) return { ok: false as const, reason: 'INVALID' as const };
  await prisma.appSetting.upsert({ where: { key: WEIGHT_KEY }, create: { key: WEIGHT_KEY, value: String(w) }, update: { value: String(w) } });
  await audit({ userId: user.id, action: 'EVALUATION_WEIGHT_SET', module: 'CONFIG', metadata: { weight: w } });
  return { ok: true as const };
}

/**
 * Estatística do mês para a META: done = colaboradores avaliados,
 * missed = ativos sem avaliação — só penaliza em MESES JÁ ENCERRADOS
 * (durante o mês corrente ainda dá tempo de avaliar).
 */
export async function getEvaluationMonthStats(unitId: string, yearMonth: string): Promise<{ done: number; missed: number }> {
  const done = await prisma.collaboratorEvaluation.count({ where: { unitId, yearMonth } });
  if (yearMonth >= currentYearMonth()) return { done, missed: 0 };
  const active = await prisma.collaboratorUnit.count({ where: { unitId, collaborator: { active: true } } });
  return { done, missed: Math.max(0, active - done) };
}

// ===== Quadro de avaliação ===================================================

export interface EvaluationRow {
  collaboratorId: string;
  name: string;
  jobTitle: string | null;
  unitId: string;
  unitName: string;
  observationCount: number;
  evaluation: (EvaluationCriteria & { comments: string | null; evaluatorName: string; updatedAt: string }) | null;
}

/** Colaboradores ativos do escopo do usuário com a avaliação do mês pedido. */
export async function listEvaluationBoard(user: SessionUser, yearMonth: string): Promise<EvaluationRow[]> {
  const collabs = await prisma.collaborator.findMany({
    where: { active: true, units: { some: { ...unitScopeWhere(user, 'unitId') } } },
    include: { units: { select: { unitId: true, unit: { select: { name: true } } } } },
    orderBy: { name: 'asc' },
    take: 500,
  });
  const ids = collabs.map((c) => c.id);
  const [evals, obsCounts] = await Promise.all([
    prisma.collaboratorEvaluation.findMany({ where: { collaboratorId: { in: ids }, yearMonth } }),
    prisma.collaboratorObservation.groupBy({ by: ['collaboratorId'], where: { collaboratorId: { in: ids } }, _count: true }),
  ]);
  const evalBy = new Map(evals.map((e) => [e.collaboratorId, e]));
  const obsBy = new Map(obsCounts.map((o) => [o.collaboratorId, o._count]));

  return collabs.map((c) => {
    const first = c.units.find((u) => canAccessUnit(user, u.unitId)) ?? c.units[0];
    const e = evalBy.get(c.id);
    return {
      collaboratorId: c.id,
      name: c.name,
      jobTitle: c.jobTitle,
      unitId: first?.unitId ?? '',
      unitName: c.units.map((u) => u.unit.name).join(', ') || '—',
      observationCount: obsBy.get(c.id) ?? 0,
      evaluation: e
        ? {
            punctuality: e.punctuality, performance: e.performance, teamwork: e.teamwork, presentation: e.presentation,
            comments: e.comments, evaluatorName: e.evaluatorName, updatedAt: e.updatedAt.toISOString(),
          }
        : null,
    };
  });
}

/** Histórico de avaliações de um colaborador (últimos 12 meses com registro). */
export async function listEvaluationHistory(user: SessionUser, collaboratorId: string) {
  const collab = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { units: { select: { unitId: true } } } });
  if (!collab || !collab.units.some((u) => canAccessUnit(user, u.unitId))) return [];
  return prisma.collaboratorEvaluation.findMany({
    where: { collaboratorId },
    orderBy: { yearMonth: 'desc' },
    take: 12,
  });
}

/** Salva/atualiza a avaliação mensal (upsert por colaborador+mês). */
export async function saveEvaluation(
  user: SessionUser,
  collaboratorId: string,
  yearMonth: string,
  input: Partial<EvaluationCriteria> & { comments?: string },
  ctx: Ctx = {},
): Promise<Result> {
  if (user.role === 'FINANCE') return { ok: false, reason: 'FORBIDDEN' };
  if (!/^\d{4}-\d{2}$/.test(yearMonth) || yearMonth > currentYearMonth()) return { ok: false, reason: 'INVALID' };
  const scores: EvaluationCriteria = { punctuality: 0, performance: 0, teamwork: 0, presentation: 0 };
  for (const k of CRITERIA) {
    const v = Math.trunc(Number(input[k]));
    if (!Number.isFinite(v) || v < 1 || v > 5) return { ok: false, reason: 'INVALID' };
    scores[k] = v;
  }
  const collab = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { name: true, units: { select: { unitId: true } } } });
  if (!collab) return { ok: false, reason: 'NOT_FOUND' };
  const unitId = collab.units.find((u) => canAccessUnit(user, u.unitId))?.unitId;
  if (!unitId) return { ok: false, reason: 'FORBIDDEN' };

  await prisma.collaboratorEvaluation.upsert({
    where: { collaboratorId_yearMonth: { collaboratorId, yearMonth } },
    create: {
      collaboratorId, collaboratorName: collab.name, unitId, yearMonth, ...scores,
      comments: input.comments?.trim() || null, evaluatorId: user.id, evaluatorName: user.name,
    },
    update: { ...scores, comments: input.comments?.trim() || null, evaluatorId: user.id, evaluatorName: user.name },
  });
  await audit({
    userId: user.id, unitId, action: 'EVALUATION_SAVED', module: 'PEOPLE', entity: 'collaborator_evaluation',
    entityId: collaboratorId, metadata: { name: collab.name, yearMonth, ...scores }, ...ctx,
  });
  return { ok: true };
}

// ===== Observações do dia a dia =============================================

export async function listObservations(user: SessionUser, collaboratorId: string) {
  const collab = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { units: { select: { unitId: true } } } });
  if (!collab || !collab.units.some((u) => canAccessUnit(user, u.unitId))) return [];
  return prisma.collaboratorObservation.findMany({
    where: { collaboratorId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function addObservation(user: SessionUser, collaboratorId: string, text: string, ctx: Ctx = {}): Promise<Result> {
  if (user.role === 'FINANCE') return { ok: false, reason: 'FORBIDDEN' };
  const t = text?.trim();
  if (!t || t.length > 2000) return { ok: false, reason: 'INVALID' };
  const collab = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { name: true, units: { select: { unitId: true } } } });
  if (!collab) return { ok: false, reason: 'NOT_FOUND' };
  const unitId = collab.units.find((u) => canAccessUnit(user, u.unitId))?.unitId;
  if (!unitId) return { ok: false, reason: 'FORBIDDEN' };

  await prisma.collaboratorObservation.create({
    data: { collaboratorId, collaboratorName: collab.name, unitId, text: t, authorId: user.id, authorName: user.name },
  });
  await audit({
    userId: user.id, unitId, action: 'OBSERVATION_ADDED', module: 'PEOPLE', entity: 'collaborator_observation',
    entityId: collaboratorId, metadata: { name: collab.name }, ...ctx,
  });
  return { ok: true };
}
