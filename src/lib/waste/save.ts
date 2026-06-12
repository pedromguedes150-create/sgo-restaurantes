import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { audit } from '@/lib/audit';
import { notifyUnitRole } from '@/lib/notifications';
import { subDays, format } from 'date-fns';
import type { SessionUser } from '@/lib/auth/session';

export interface WasteItemInput {
  categoryId: string;
  kg: number;
}

export interface WasteAlert {
  categoryId: string;
  categoryName: string;
  kg: number;
  avg7: number;
  increasePct: number;
}

export type SaveWasteResult =
  | { ok: true; entryId: string; operationalDate: string; alerts: WasteAlert[] }
  | { ok: false; reason: 'FORBIDDEN' | 'EVIDENCE_REQUIRED' | 'INVALID' };

/**
 * Salva o lançamento de desperdício do dia (Módulo 2).
 * - 1 lançamento por unidade/dia operacional (cria ou edita).
 * - Conclui a(s) tarefa(s) WASTE vinculada(s) do dia (idempotente).
 * - Se a tarefa exige evidência, exige a foto da balança.
 * - Alerta quando uma categoria sobe > 20% vs média de 7 dias.
 */
export async function saveWasteEntry(
  user: SessionUser,
  input: {
    unitId: string;
    operationalDate?: string;
    items: WasteItemInput[];
    observation?: string;
    evidencePath?: string;
  },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<SaveWasteResult> {
  try {
    assertUnitAccess(user, input.unitId);
  } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }

  if (!Array.isArray(input.items) || input.items.some((i) => !i.categoryId || i.kg < 0 || Number.isNaN(i.kg))) {
    return { ok: false, reason: 'INVALID' };
  }
  // Dedup por categoria (categoryId repetido violaria a unique e geraria 500)
  const itemMap = new Map<string, number>();
  for (const i of input.items) itemMap.set(i.categoryId, i.kg);
  const items = [...itemMap.entries()].map(([categoryId, kg]) => ({ categoryId, kg }));

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId } });
  if (!unit) return { ok: false, reason: 'INVALID' };

  const cfg = { timezone: unit.timezone, cutoffHour: unit.cutoffHour };
  const today = currentOperationalDate(cfg);
  let operationalDate = today;
  if (input.operationalDate) {
    // Valida formato e janela: hoje até 7 dias atrás (sem futuro, sem backdating livre)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.operationalDate)) return { ok: false, reason: 'INVALID' };
    const limit = format(subDays(new Date(`${today}T12:00:00`), 7), 'yyyy-MM-dd');
    if (input.operationalDate > today || input.operationalDate < limit) return { ok: false, reason: 'INVALID' };
    operationalDate = input.operationalDate;
  }

  // Tarefas WASTE do dia para esta unidade (deep-link/conclusão)
  const wasteTasks = await prisma.taskInstance.findMany({
    where: { unitId: unit.id, operationalDate, template: { module: 'WASTE' } },
    include: { template: { select: { requiresEvidence: true } } },
  });
  const needsEvidence = wasteTasks.some((t) => t.template.requiresEvidence);
  if (needsEvidence && !input.evidencePath) {
    return { ok: false, reason: 'EVIDENCE_REQUIRED' };
  }

  // Upsert do lançamento + substituição dos itens (transação)
  const entry = await prisma.$transaction(async (tx) => {
    const e = await tx.wasteEntry.upsert({
      where: { unitId_operationalDate: { unitId: unit.id, operationalDate } },
      create: {
        unitId: unit.id,
        operationalDate,
        observation: input.observation,
        evidencePath: input.evidencePath,
        createdById: user.id,
      },
      update: {
        observation: input.observation,
        ...(input.evidencePath ? { evidencePath: input.evidencePath } : {}),
      },
    });
    await tx.wasteEntryItem.deleteMany({ where: { entryId: e.id } });
    if (items.length) {
      await tx.wasteEntryItem.createMany({
        data: items.map((i) => ({ entryId: e.id, categoryId: i.categoryId, kg: i.kg })),
      });
    }
    return e;
  });

  // Conclui as tarefas WASTE do dia (idempotente; marca o checklist)
  for (const t of wasteTasks) {
    if (t.status === 'PENDING') {
      await prisma.taskInstance.updateMany({
        where: { id: t.id, status: 'PENDING' },
        data: {
          status: 'DONE',
          completedById: user.id,
          completedAt: new Date(),
          evidencePath: input.evidencePath ?? null,
        },
      });
    }
  }

  const alerts = await computeAlerts(unit.id, operationalDate, items);

  await audit({
    userId: user.id,
    unitId: unit.id,
    action: 'WASTE_SAVE',
    module: 'WASTE',
    entity: 'waste_entry',
    entityId: entry.id,
    metadata: { operationalDate, items: items.length, alerts: alerts.length },
    ...ctx,
  });
  if (alerts.length) {
    // Alerta ao Supervisor (Central de Notificações entra em fase futura)
    await audit({
      userId: user.id,
      unitId: unit.id,
      action: 'WASTE_ALERT',
      module: 'WASTE',
      entity: 'waste_entry',
      entityId: entry.id,
      metadata: { alerts },
      ...ctx,
    });
    // Alerta ao Supervisor da unidade (spec Módulo 2: categoria >20% vs média 7d)
    const resumo = alerts.map((a) => `${a.categoryName} +${a.increasePct}%`).join(', ');
    await notifyUnitRole(unit.id, 'SUPERVISOR', {
      title: 'Desperdício acima da média',
      body: `${unit.name} (${operationalDate}): ${resumo} em relação à média de 7 dias.`,
      link: `/modulos/desperdicios?unit=${unit.id}`,
      module: 'WASTE',
    });
  }

  return { ok: true, entryId: entry.id, operationalDate, alerts };
}

/** Alerta quando a categoria sobe > 20% vs média dos 7 dias operacionais anteriores. */
async function computeAlerts(
  unitId: string,
  operationalDate: string,
  items: WasteItemInput[],
): Promise<WasteAlert[]> {
  const prevDates: string[] = [];
  const base = new Date(`${operationalDate}T12:00:00`);
  for (let d = 1; d <= 7; d++) prevDates.push(format(subDays(base, d), 'yyyy-MM-dd'));

  const prev = await prisma.wasteEntryItem.findMany({
    where: { entry: { unitId, operationalDate: { in: prevDates } } },
    select: {
      categoryId: true,
      kg: true,
      entry: { select: { operationalDate: true } },
      category: { select: { name: true } },
    },
  });

  // soma por categoria + nº de dias com registro
  const sums = new Map<string, { sum: number; days: Set<string>; name: string }>();
  for (const p of prev) {
    const cur = sums.get(p.categoryId) ?? { sum: 0, days: new Set<string>(), name: p.category.name };
    cur.sum += Number(p.kg);
    cur.days.add(p.entry.operationalDate);
    sums.set(p.categoryId, cur);
  }

  const alerts: WasteAlert[] = [];
  for (const i of items) {
    const agg = sums.get(i.categoryId);
    if (!agg || agg.days.size === 0) continue;
    const avg7 = agg.sum / agg.days.size;
    if (avg7 > 0 && i.kg > avg7 * 1.2) {
      alerts.push({
        categoryId: i.categoryId,
        categoryName: agg.name,
        kg: i.kg,
        avg7: Math.round(avg7 * 100) / 100,
        increasePct: Math.round(((i.kg - avg7) / avg7) * 100),
      });
    }
  }
  return alerts;
}
