import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { buildDefaultModels } from '@/lib/checklist-models-seed';
import type { SessionUser } from '@/lib/auth/session';
import type { ChecklistScope } from '@prisma/client';

export type ModelResult = { ok: true; id?: string; created?: number } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' };
type Ctx = { ip?: string | null; userAgent?: string | null };
function isAdmin(u: SessionUser) { return u.role === 'ADMIN'; }

export interface ModelItemInput { section?: string | null; text: string; requiresPhoto?: boolean }
function normModelItems(items?: ModelItemInput[]) {
  return (items ?? []).filter((i) => i.text?.trim()).map((i, order) => ({ section: i.section?.trim() || null, text: i.text.trim(), requiresPhoto: Boolean(i.requiresPhoto), order }));
}

/** Garante que a biblioteca tenha os modelos padrão do documento (idempotente). */
export async function ensureDefaultModels(): Promise<void> {
  const count = await prisma.checklistModel.count();
  if (count > 0) return;
  const defaults = buildDefaultModels();
  for (let i = 0; i < defaults.length; i++) {
    const m = defaults[i];
    await prisma.checklistModel.create({
      data: {
        name: m.name, category: m.category, moment: m.moment, scope: 'UNIT', limitTime: m.limitTime,
        weight: m.weight, requiresEvidence: m.requiresEvidence, builtin: true, order: i,
        items: { create: m.items.map((it, order) => ({ section: null, text: it.text, requiresPhoto: it.requiresPhoto, order })) },
      },
    });
  }
}

export async function listChecklistModels(opts: { activeOnly?: boolean } = {}) {
  return prisma.checklistModel.findMany({
    where: opts.activeOnly ? { active: true } : {},
    orderBy: [{ active: 'desc' }, { order: 'asc' }, { name: 'asc' }],
    include: { items: { orderBy: { order: 'asc' } } },
  });
}

export async function createChecklistModel(user: SessionUser, input: { name: string; category?: string; moment?: string; limitTime?: string | null; weight?: number; scope?: ChecklistScope; requiresEvidence?: boolean; items?: ModelItemInput[] }, ctx: Ctx = {}): Promise<ModelResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.name?.trim()) return { ok: false, reason: 'INVALID' };
  const count = await prisma.checklistModel.count();
  const m = await prisma.checklistModel.create({
    data: {
      name: input.name.trim(), category: input.category?.trim() || null, moment: input.moment?.trim() || null,
      scope: input.scope === 'MANAGER' ? 'MANAGER' : 'UNIT', limitTime: normLimit(input.limitTime),
      weight: clampW(input.weight), requiresEvidence: Boolean(input.requiresEvidence), order: count, createdById: user.id,
      items: { create: normModelItems(input.items) },
    },
  });
  await audit({ userId: user.id, action: 'CHECKLIST_MODEL_CREATE', module: 'CONFIG', entity: 'checklist_model', entityId: m.id, ...ctx });
  return { ok: true, id: m.id };
}

export async function updateChecklistModel(user: SessionUser, id: string, input: { name?: string; category?: string; moment?: string; limitTime?: string | null; weight?: number; scope?: ChecklistScope; requiresEvidence?: boolean; items?: ModelItemInput[] }, ctx: Ctx = {}): Promise<ModelResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (input.name !== undefined && !input.name.trim()) return { ok: false, reason: 'INVALID' };
  await prisma.$transaction(async (tx) => {
    await tx.checklistModel.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.category !== undefined ? { category: input.category.trim() || null } : {}),
        ...(input.moment !== undefined ? { moment: input.moment.trim() || null } : {}),
        ...(input.limitTime !== undefined ? { limitTime: normLimit(input.limitTime) } : {}),
        ...(input.weight !== undefined ? { weight: clampW(input.weight) } : {}),
        ...(input.scope !== undefined ? { scope: input.scope === 'MANAGER' ? 'MANAGER' : 'UNIT' } : {}),
        ...(input.requiresEvidence !== undefined ? { requiresEvidence: Boolean(input.requiresEvidence) } : {}),
      },
    });
    if (input.items !== undefined) {
      await tx.checklistModelItem.deleteMany({ where: { modelId: id } });
      const items = normModelItems(input.items);
      if (items.length) await tx.checklistModelItem.createMany({ data: items.map((i) => ({ modelId: id, ...i })) });
    }
  });
  await audit({ userId: user.id, action: 'CHECKLIST_MODEL_UPDATE', module: 'CONFIG', entity: 'checklist_model', entityId: id, ...ctx });
  return { ok: true };
}

export async function toggleChecklistModel(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<ModelResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.checklistModel.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'CHECKLIST_MODEL_ACTIVATE' : 'CHECKLIST_MODEL_DEACTIVATE', module: 'CONFIG', entity: 'checklist_model', entityId: id, ...ctx });
  return { ok: true };
}

export async function deleteChecklistModel(user: SessionUser, id: string, ctx: Ctx = {}): Promise<ModelResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.checklistModel.delete({ where: { id } }).catch(() => {}); // itens em cascade
  await audit({ userId: user.id, action: 'CHECKLIST_MODEL_DELETE', module: 'CONFIG', entity: 'checklist_model', entityId: id, ...ctx });
  return { ok: true };
}

/** Gera checklists (TaskTemplate) numa unidade a partir de modelos selecionados. */
export async function createTemplatesFromModels(user: SessionUser, unitId: string, modelIds: string[], ctx: Ctx = {}): Promise<ModelResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!unitId || !modelIds?.length) return { ok: false, reason: 'INVALID' };
  const models = await prisma.checklistModel.findMany({ where: { id: { in: modelIds } }, include: { items: { orderBy: { order: 'asc' } } } });
  const existing = new Set((await prisma.taskTemplate.findMany({ where: { unitId }, select: { name: true } })).map((t) => t.name));
  let created = 0;
  for (const m of models) {
    if (existing.has(m.name)) continue;
    await prisma.taskTemplate.create({
      data: {
        unitId, name: m.name, limitTime: m.limitTime, weight: m.weight, scope: m.scope, requiresEvidence: m.requiresEvidence,
        items: { create: m.items.map((i) => ({ section: i.section, text: i.text, requiresPhoto: i.requiresPhoto, order: i.order })) },
      },
    });
    created++;
  }
  await audit({ userId: user.id, unitId, action: 'TEMPLATE_FROM_MODELS', module: 'CONFIG', entity: 'task_template', metadata: { created, models: modelIds.length }, ...ctx });
  return { ok: true, created };
}

function normLimit(v?: string | null): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return /^\d{1,2}:\d{2}$/.test(s) ? s : null;
}
function clampW(w?: number): number { return Number.isFinite(w) ? Math.max(0, Math.trunc(w as number)) : 10; }
