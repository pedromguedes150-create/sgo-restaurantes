import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { canEditModule } from '@/lib/permissions';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import { FORM_FIELD_KIND_SET, type FormFieldView } from '@/lib/checklist-forms/types';
import { Prisma, type ChecklistFieldKind } from '@prisma/client';
import type { SessionUser } from '@/lib/auth/session';

const MODULE = 'CHECKLIST_FORMS';
type Ctx = { ip?: string | null; userAgent?: string | null };
type Fail = { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };
export type FormResult<T = object> = ({ ok: true } & T) | Fail;

/** Checagem dupla (CLAUDE.md regra 3): permissão de função E escopo de unidade. */
async function guard(user: SessionUser, unitId: string): Promise<Fail | null> {
  if (!(await canEditModule(user.role, MODULE))) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  return null;
}

function newToken(): string {
  return randomBytes(24).toString('base64url'); // ~32 chars url-safe, revogável
}

function toOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => String(o).trim()).filter(Boolean).slice(0, 50);
}

/* ───────── Listagem / leitura (config) ───────── */

export interface ChecklistFormRow {
  id: string; unitId: string; title: string; active: boolean; linkEnabled: boolean;
  publicToken: string | null; expiresAt: string | null; submissions: number; fields: number;
}

/** Fichas (deliveryMode=LINK) do escopo do usuário. Null = sem permissão. */
export async function listChecklistForms(user: SessionUser): Promise<ChecklistFormRow[] | null> {
  if (!(await canEditModule(user.role, MODULE))) return null;
  const rows = await prisma.taskTemplate.findMany({
    where: { deliveryMode: 'LINK', ...unitScopeWhere(user, 'unitId') },
    orderBy: [{ active: 'desc' }, { order: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { submissions: true, items: true } } },
  });
  return rows.map((t) => ({
    id: t.id, unitId: t.unitId, title: t.name, active: t.active, linkEnabled: t.linkEnabled,
    publicToken: t.publicToken, expiresAt: t.expiresAt?.toISOString() ?? null,
    submissions: t._count.submissions, fields: t._count.items,
  }));
}

export interface ChecklistFormEdit {
  id: string; unitId: string; title: string; description: string | null;
  active: boolean; linkEnabled: boolean; publicToken: string | null;
  expiresAt: string | null; maxPerDay: number; notifyRole: string | null;
  fields: FormFieldView[]; submissions: number;
}

export async function getChecklistFormForEdit(user: SessionUser, id: string): Promise<ChecklistFormEdit | null> {
  const t = await prisma.taskTemplate.findUnique({
    where: { id },
    include: { items: { orderBy: { order: 'asc' } }, _count: { select: { submissions: true } } },
  });
  if (!t || t.deliveryMode !== 'LINK') return null;
  if (!(await canEditModule(user.role, MODULE)) || !canAccessUnit(user, t.unitId)) return null;
  return {
    id: t.id, unitId: t.unitId, title: t.name, description: t.description,
    active: t.active, linkEnabled: t.linkEnabled, publicToken: t.publicToken,
    expiresAt: t.expiresAt?.toISOString() ?? null, maxPerDay: t.maxPerDay, notifyRole: t.notifyRole,
    submissions: t._count.submissions,
    fields: t.items.map((i) => ({
      id: i.id, kind: i.fieldKind, label: i.text, section: i.section,
      required: i.required, options: toOptions(i.options), order: i.order,
    })),
  };
}

/* ───────── Criar / editar a ficha ───────── */

export async function createChecklistForm(user: SessionUser, input: { unitId: string; title: string; description?: string }, ctx: Ctx = {}): Promise<FormResult<{ id: string }>> {
  const g = await guard(user, input.unitId); if (g) return g;
  const title = input.title?.trim();
  if (!title) return { ok: false, reason: 'INVALID' };
  const t = await prisma.taskTemplate.create({
    data: {
      unitId: input.unitId, name: title, description: input.description?.trim() || null,
      deliveryMode: 'LINK', entersMeta: false, module: 'GENERAL',
      publicToken: newToken(), linkEnabled: true,
    },
    select: { id: true },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'CHECKLIST_FORM_CREATE', module: 'TASKS', entity: 'task_template', entityId: t.id, metadata: { title }, ...ctx });
  return { ok: true, id: t.id };
}

export async function updateChecklistForm(
  user: SessionUser, id: string,
  input: { title?: string; description?: string; active?: boolean; linkEnabled?: boolean; expiresAt?: string | null; maxPerDay?: number; notifyRole?: string | null },
  ctx: Ctx = {},
): Promise<FormResult> {
  const t = await prisma.taskTemplate.findUnique({ where: { id }, select: { unitId: true, deliveryMode: true } });
  if (!t || t.deliveryMode !== 'LINK') return { ok: false, reason: 'NOT_FOUND' };
  const g = await guard(user, t.unitId); if (g) return g;
  const data: Prisma.TaskTemplateUpdateInput = {};
  if (input.title !== undefined) { const v = input.title.trim(); if (!v) return { ok: false, reason: 'INVALID' }; data.name = v; }
  if (input.description !== undefined) data.description = input.description.trim() || null;
  if (input.active !== undefined) data.active = input.active;
  if (input.linkEnabled !== undefined) data.linkEnabled = input.linkEnabled;
  if (input.maxPerDay !== undefined) data.maxPerDay = Math.max(0, Math.trunc(input.maxPerDay));
  if (input.notifyRole !== undefined) data.notifyRole = input.notifyRole || null;
  if (input.expiresAt !== undefined) {
    if (input.expiresAt === null) data.expiresAt = null;
    else { const d = new Date(input.expiresAt); if (Number.isNaN(d.getTime())) return { ok: false, reason: 'INVALID' }; data.expiresAt = d; }
  }
  await prisma.taskTemplate.update({ where: { id }, data });
  await audit({ userId: user.id, unitId: t.unitId, action: 'CHECKLIST_FORM_UPDATE', module: 'TASKS', entity: 'task_template', entityId: id, metadata: { fields: Object.keys(data) }, ...ctx });
  return { ok: true };
}

/** Rotaciona o token do link (revoga o antigo). */
export async function rotatePublicToken(user: SessionUser, id: string, ctx: Ctx = {}): Promise<FormResult<{ token: string }>> {
  const t = await prisma.taskTemplate.findUnique({ where: { id }, select: { unitId: true, deliveryMode: true } });
  if (!t || t.deliveryMode !== 'LINK') return { ok: false, reason: 'NOT_FOUND' };
  const g = await guard(user, t.unitId); if (g) return g;
  const token = newToken();
  await prisma.taskTemplate.update({ where: { id }, data: { publicToken: token } });
  await audit({ userId: user.id, unitId: t.unitId, action: 'CHECKLIST_FORM_TOKEN_ROTATE', module: 'TASKS', entity: 'task_template', entityId: id, ...ctx });
  return { ok: true, token };
}

/* ───────── Campos (perguntas) ───────── */

export async function saveField(
  user: SessionUser, templateId: string,
  input: { id?: string; kind: ChecklistFieldKind; label: string; section?: string | null; required?: boolean; options?: string[] },
  ctx: Ctx = {},
): Promise<FormResult<{ id: string }>> {
  const t = await prisma.taskTemplate.findUnique({ where: { id: templateId }, select: { unitId: true, deliveryMode: true } });
  if (!t || t.deliveryMode !== 'LINK') return { ok: false, reason: 'NOT_FOUND' };
  const g = await guard(user, t.unitId); if (g) return g;
  if (!FORM_FIELD_KIND_SET.has(input.kind)) return { ok: false, reason: 'INVALID' };
  const label = input.label?.trim();
  if (!label) return { ok: false, reason: 'INVALID' };
  const options = input.kind === 'SELECT' ? toOptions(input.options) : [];
  if (input.kind === 'SELECT' && options.length === 0) return { ok: false, reason: 'INVALID' };
  const base = {
    text: label, section: input.section?.trim() || null, fieldKind: input.kind,
    required: input.kind === 'SECTION' ? false : Boolean(input.required),
    options: options.length ? (options as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
  };
  let fieldId: string;
  if (input.id) {
    const existing = await prisma.checklistItem.findUnique({ where: { id: input.id }, select: { templateId: true } });
    if (!existing || existing.templateId !== templateId) return { ok: false, reason: 'NOT_FOUND' };
    await prisma.checklistItem.update({ where: { id: input.id }, data: base });
    fieldId = input.id;
  } else {
    const agg = await prisma.checklistItem.aggregate({ where: { templateId }, _max: { order: true } });
    const row = await prisma.checklistItem.create({ data: { templateId, order: (agg._max.order ?? -1) + 1, ...base }, select: { id: true } });
    fieldId = row.id;
  }
  await audit({ userId: user.id, unitId: t.unitId, action: 'CHECKLIST_FORM_FIELD_SET', module: 'TASKS', entity: 'checklist_item', entityId: fieldId, metadata: { kind: input.kind, label }, ...ctx });
  return { ok: true, id: fieldId };
}

export async function deleteField(user: SessionUser, fieldId: string, ctx: Ctx = {}): Promise<FormResult> {
  const it = await prisma.checklistItem.findUnique({ where: { id: fieldId }, include: { template: { select: { unitId: true, deliveryMode: true } } } });
  if (!it || it.template.deliveryMode !== 'LINK') return { ok: false, reason: 'NOT_FOUND' };
  const g = await guard(user, it.template.unitId); if (g) return g;
  await prisma.checklistItem.delete({ where: { id: fieldId } });
  await audit({ userId: user.id, unitId: it.template.unitId, action: 'CHECKLIST_FORM_FIELD_DELETE', module: 'TASKS', entity: 'checklist_item', entityId: fieldId, ...ctx });
  return { ok: true };
}

export async function reorderFields(user: SessionUser, templateId: string, orderedIds: string[], ctx: Ctx = {}): Promise<FormResult> {
  const t = await prisma.taskTemplate.findUnique({ where: { id: templateId }, select: { unitId: true, deliveryMode: true } });
  if (!t || t.deliveryMode !== 'LINK') return { ok: false, reason: 'NOT_FOUND' };
  const g = await guard(user, t.unitId); if (g) return g;
  await prisma.$transaction(orderedIds.map((fid, i) => prisma.checklistItem.updateMany({ where: { id: fid, templateId }, data: { order: i } })));
  await audit({ userId: user.id, unitId: t.unitId, action: 'CHECKLIST_FORM_FIELDS_REORDER', module: 'TASKS', entity: 'task_template', entityId: templateId, ...ctx });
  return { ok: true };
}
