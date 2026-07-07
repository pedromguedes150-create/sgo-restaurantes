import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUnitRole, notifyAdmins } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Recorrência de visitas do supervisor (refino da Fase B): 1 plano por unidade
 * ("visitar a cada N dias"). Concluir uma visita reagenda a próxima; vencido →
 * aviso 1×/dia ao supervisor da unidade (espelho do MaintenancePlan).
 */
type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 24 * 60 * 60 * 1000);

function canOperate(user: SessionUser): boolean {
  return user.role === 'SUPERVISOR' || user.role === 'ADMIN';
}

/** Define/atualiza a recorrência da unidade (frequencyDays = 0 desativa). */
export async function setVisitPlan(user: SessionUser, unitId: string, frequencyDays: number, ctx: Ctx = {}): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const freq = Math.trunc(Number(frequencyDays));
  if (!Number.isFinite(freq) || freq < 0 || freq > 365) return { ok: false, reason: 'INVALID' };

  if (freq === 0) {
    await prisma.supervisorVisitPlan.updateMany({ where: { unitId }, data: { active: false } });
    await audit({ userId: user.id, unitId, action: 'VISIT_PLAN_OFF', module: 'SUPERVISION', entity: 'supervisor_visit_plan', ...ctx });
    return { ok: true };
  }

  // próxima cobrança conta a partir da última visita concluída (ou de hoje)
  const lastDone = await prisma.supervisorVisit.findFirst({
    where: { unitId, status: 'DONE' },
    orderBy: { doneAt: 'desc' },
    select: { doneAt: true },
  });
  const base = lastDone?.doneAt ?? new Date();
  await prisma.supervisorVisitPlan.upsert({
    where: { unitId },
    create: {
      unitId, frequencyDays: freq, createdById: user.id, createdByName: user.name,
      lastVisitAt: lastDone?.doneAt ?? null, nextDueAt: addDays(base, freq),
    },
    update: { frequencyDays: freq, active: true, nextDueAt: addDays(base, freq), lastNotifiedAt: null },
  });
  await audit({ userId: user.id, unitId, action: 'VISIT_PLAN_SET', module: 'SUPERVISION', entity: 'supervisor_visit_plan', metadata: { frequencyDays: freq }, ...ctx });
  return { ok: true };
}

/** Chamado ao concluir uma visita: registra e reagenda a próxima. */
export async function registerVisitDone(unitId: string): Promise<void> {
  const plan = await prisma.supervisorVisitPlan.findUnique({ where: { unitId }, select: { id: true, active: true, frequencyDays: true } });
  if (!plan?.active) return;
  const now = new Date();
  await prisma.supervisorVisitPlan.update({
    where: { id: plan.id },
    data: { lastVisitAt: now, nextDueAt: addDays(now, plan.frequencyDays), lastNotifiedAt: null },
  });
}

export interface VisitPlanRow { unitId: string; unitName: string; frequencyDays: number; active: boolean; lastVisitAt: string | null; nextDueAt: string; overdue: boolean }

/** Planos do escopo do usuário (para a aba Visitas). */
export async function listVisitPlans(user: SessionUser): Promise<VisitPlanRow[]> {
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const plans = await prisma.supervisorVisitPlan.findMany({ where: { unitId: { in: units.map((u) => u.id) } } });
  const byUnit = new Map(plans.map((p) => [p.unitId, p]));
  const now = new Date();
  return units.map((u) => {
    const p = byUnit.get(u.id);
    return {
      unitId: u.id, unitName: u.name,
      frequencyDays: p?.active ? p.frequencyDays : 0,
      active: Boolean(p?.active),
      lastVisitAt: p?.lastVisitAt ? p.lastVisitAt.toISOString() : null,
      nextDueAt: p?.nextDueAt ? p.nextDueAt.toISOString() : '',
      overdue: Boolean(p?.active && p.nextDueAt <= now),
    };
  });
}

/** Scheduler: avisa supervisores das unidades com visita vencida (1×/dia por plano). */
export async function runDueVisitPlans(): Promise<{ notified: number }> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = await prisma.supervisorVisitPlan.findMany({
    where: { active: true, nextDueAt: { lte: now }, OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: startOfDay } }] },
    select: { id: true, unitId: true, frequencyDays: true, lastVisitAt: true },
  });
  for (const p of due) {
    const unit = await prisma.unit.findUnique({ where: { id: p.unitId }, select: { name: true } });
    const dias = p.lastVisitAt ? Math.floor((now.getTime() - p.lastVisitAt.getTime()) / 86400000) : null;
    const payload = {
      title: 'Visita à unidade vencida',
      body: `${unit?.name ?? 'Unidade'} deveria ser visitada a cada ${p.frequencyDays} dia(s)${dias != null ? ` — última visita há ${dias} dia(s)` : ' — nenhuma visita registrada'}. Agende na Rotina do Supervisor.`,
      link: '/modulos/supervisao', module: 'SUPERVISION',
    };
    await notifyUnitRole(p.unitId, 'SUPERVISOR', payload).catch(() => {});
    await notifyAdmins(payload).catch(() => {});
    await prisma.supervisorVisitPlan.update({ where: { id: p.id }, data: { lastNotifiedAt: now } });
  }
  return { notified: due.length };
}
