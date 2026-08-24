import { prisma } from '@/lib/db/prisma';
import { acharSobreposicao, mensagemDeSobreposicao } from '@/lib/commands/ranges';
import { hashPassword } from '@/lib/auth/password';
import { fromZonedTime } from 'date-fns-tz';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { Role, TaskModule } from '@prisma/client';

export type AdminResult =
  | { ok: true; id?: string }
  /** `message` substitui o texto genérico da rota quando o motivo tem detalhe
   *  que só aqui se conhece — "invade a faixa X" ajuda; "Dados inválidos" não. */
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'CONFLICT' | 'BLOCKED'; message?: string };

type Ctx = { ip?: string | null; userAgent?: string | null };

/** Faixas ATIVAS da unidade, para checar sobreposição. Inativa não conta: ela
 *  está fora da sequência e não disputa comanda com ninguém — mas ao reativar,
 *  a checagem roda de novo. */
async function faixasAtivas(unitId: string) {
  return prisma.commandSequence.findMany({
    where: { unitId, active: true },
    select: { id: true, name: true, rangeStart: true, rangeEnd: true },
    orderBy: { rangeStart: 'asc' },
  });
}

function isAdmin(user: SessionUser) {
  return user.role === 'ADMIN';
}

/**
 * Normaliza CNPJ para 14 dígitos (usado p/ casar notas de gás por CNPJ da unidade).
 * '' → null (limpa). Provido mas != 14 dígitos → inválido.
 */
function normUnitCnpj(v: string): { ok: true; value: string | null } | { ok: false } {
  const d = String(v).replace(/\D/g, '');
  if (d === '') return { ok: true, value: null };
  if (d.length !== 14) return { ok: false };
  return { ok: true, value: d };
}

/* ───────────────────────────── Unidades ───────────────────────────── */
export async function createUnit(user: SessionUser, input: { name: string; code: string; address?: string; cutoffHour?: number; timezone?: string; cnpj?: string }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.name?.trim() || !input.code?.trim()) return { ok: false, reason: 'INVALID' };
  let cnpj: string | null = null;
  if (input.cnpj !== undefined) {
    const c = normUnitCnpj(input.cnpj);
    if (!c.ok) return { ok: false, reason: 'INVALID' };
    cnpj = c.value;
  }
  const exists = await prisma.unit.findUnique({ where: { code: input.code.trim().toUpperCase() } });
  if (exists) return { ok: false, reason: 'CONFLICT' };
  const u = await prisma.unit.create({
    data: { name: input.name.trim(), code: input.code.trim().toUpperCase(), address: input.address?.trim() || null, cutoffHour: clampHour(input.cutoffHour), timezone: input.timezone?.trim() || 'America/Sao_Paulo', cnpj },
  });
  await audit({ userId: user.id, unitId: u.id, action: 'UNIT_CREATE', module: 'CONFIG', entity: 'unit', entityId: u.id, ...ctx });
  return { ok: true, id: u.id };
}

export async function updateUnit(user: SessionUser, id: string, input: { name?: string; address?: string; cutoffHour?: number; timezone?: string; active?: boolean; rhUnitName?: string; cnpj?: string }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  let cnpjPatch: { cnpj?: string | null } = {};
  if (input.cnpj !== undefined) {
    const c = normUnitCnpj(input.cnpj);
    if (!c.ok) return { ok: false, reason: 'INVALID' };
    cnpjPatch = { cnpj: c.value };
  }
  const u = await prisma.unit.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.address !== undefined ? { address: input.address.trim() || null } : {}),
      ...(input.cutoffHour !== undefined ? { cutoffHour: clampHour(input.cutoffHour) } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone.trim() } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.rhUnitName !== undefined ? { rhUnitName: input.rhUnitName.trim() || null } : {}),
      ...cnpjPatch,
    },
  });
  await audit({ userId: user.id, unitId: id, action: 'UNIT_UPDATE', module: 'CONFIG', entity: 'unit', entityId: id, ...ctx });
  return { ok: true, id: u.id };
}

export async function deleteUnit(user: SessionUser, id: string, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  // Excluir unidade faz cascade em TODOS os dados operacionais (tarefas, desperdícios,
  // ocorrências, comandas, cancelamentos, pagamentos, notas, inventário, alocações…).
  // Bloqueia se houver histórico — nesse caso o correto é INATIVAR (toggle active).
  const [tasks, waste, occ, cmd, canc, pay, notes, inv] = await prisma.$transaction([
    prisma.taskInstance.count({ where: { unitId: id } }),
    prisma.wasteEntry.count({ where: { unitId: id } }),
    prisma.occurrence.count({ where: { unitId: id } }),
    prisma.commandCount.count({ where: { unitId: id } }),
    prisma.cancellation.count({ where: { unitId: id } }),
    prisma.paymentRequest.count({ where: { unitId: id } }),
    prisma.receivedNote.count({ where: { unitId: id } }),
    prisma.inventorySchedule.count({ where: { unitId: id } }),
  ]);
  if (tasks + waste + occ + cmd + canc + pay + notes + inv > 0) return { ok: false, reason: 'BLOCKED' };
  await prisma.unit.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, action: 'UNIT_DELETE', module: 'CONFIG', entity: 'unit', entityId: id, ...ctx });
  return { ok: true };
}

function clampHour(h?: number) {
  const n = Number.isFinite(h) ? Math.trunc(h as number) : 4;
  return Math.min(23, Math.max(0, n));
}

/* ───────────────────────────── Usuários ───────────────────────────── */
export async function createUser(user: SessionUser, input: { name: string; email: string; role: Role; password: string; unitIds?: string[] }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.name?.trim() || !input.email?.trim() || !input.password || input.password.length < 6 || !input.role) return { ok: false, reason: 'INVALID' };
  const email = input.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return { ok: false, reason: 'CONFLICT' };
  const passwordHash = await hashPassword(input.password);
  const created = await prisma.user.create({
    data: { name: input.name.trim(), email, role: input.role, passwordHash, memberships: input.unitIds?.length ? { create: input.unitIds.map((unitId) => ({ unitId })) } : undefined },
  });
  await audit({ userId: user.id, action: 'USER_CREATE', module: 'CONFIG', entity: 'user', entityId: created.id, metadata: { role: input.role }, ...ctx });
  return { ok: true, id: created.id };
}

export async function toggleUser(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (id === user.id) return { ok: false, reason: 'INVALID' }; // não inative a si mesmo
  await prisma.user.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'USER_ACTIVATE' : 'USER_DEACTIVATE', module: 'CONFIG', entity: 'user', entityId: id, ...ctx });
  return { ok: true };
}

export async function updateUser(user: SessionUser, id: string, input: { name?: string; role?: Role; password?: string }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (input.name !== undefined && !input.name.trim()) return { ok: false, reason: 'INVALID' };
  if (input.password !== undefined && input.password.length > 0 && input.password.length < 6) return { ok: false, reason: 'INVALID' };
  if (id === user.id && input.role !== undefined && input.role !== user.role) return { ok: false, reason: 'INVALID' }; // não rebaixe a si mesmo
  const data: { name?: string; role?: Role; passwordHash?: string } = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.role !== undefined) data.role = input.role;
  if (input.password) data.passwordHash = await hashPassword(input.password);
  await prisma.user.update({ where: { id }, data });
  // Trocar a senha invalida sessões antigas (refresh tokens)
  if (data.passwordHash) await prisma.refreshToken.deleteMany({ where: { userId: id } });
  await audit({ userId: user.id, action: 'USER_UPDATE', module: 'CONFIG', entity: 'user', entityId: id, metadata: { fields: Object.keys(data) }, ...ctx });
  return { ok: true };
}

export async function deleteUser(user: SessionUser, id: string, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (id === user.id) return { ok: false, reason: 'INVALID' }; // não exclua a si mesmo
  // Histórico operacional é preservado (relações com autor usam SetNull); apenas
  // vínculos de unidade, tokens e leituras de POP somem (Cascade).
  await prisma.user.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, action: 'USER_DELETE', module: 'CONFIG', entity: 'user', entityId: id, ...ctx });
  return { ok: true };
}

export async function setUserUnits(user: SessionUser, id: string, unitIds: string[], ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.$transaction([
    prisma.unitMembership.deleteMany({ where: { userId: id } }),
    prisma.unitMembership.createMany({ data: unitIds.map((unitId) => ({ userId: id, unitId })), skipDuplicates: true }),
  ]);
  await audit({ userId: user.id, action: 'USER_UNITS', module: 'CONFIG', entity: 'user', entityId: id, metadata: { unitIds }, ...ctx });
  return { ok: true };
}

/* ──────────────────────── Categorias de desperdício ──────────────────── */
function slugCode(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'CAT'; }

export async function createWasteCategory(user: SessionUser, input: { name: string; measure?: string }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.name?.trim()) return { ok: false, reason: 'INVALID' };
  let code = slugCode(input.name);
  if (await prisma.wasteCategory.findUnique({ where: { code } })) code = `${code}_${Date.now().toString().slice(-4)}`;
  const count = await prisma.wasteCategory.count();
  const c = await prisma.wasteCategory.create({ data: { name: input.name.trim(), code, order: count, measure: input.measure === 'un' ? 'un' : 'kg' } });
  await audit({ userId: user.id, action: 'WASTE_CATEGORY_CREATE', module: 'CONFIG', entity: 'waste_category', entityId: c.id, ...ctx });
  return { ok: true, id: c.id };
}
export async function updateWasteCategory(user: SessionUser, id: string, input: { name?: string; measure?: string }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (input.name !== undefined && !input.name.trim()) return { ok: false, reason: 'INVALID' };
  await prisma.wasteCategory.update({ where: { id }, data: { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.measure !== undefined ? { measure: input.measure === 'un' ? 'un' : 'kg' } : {}) } });
  await audit({ userId: user.id, action: 'WASTE_CATEGORY_UPDATE', module: 'CONFIG', entity: 'waste_category', entityId: id, ...ctx });
  return { ok: true };
}
export async function toggleWasteCategory(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.wasteCategory.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'WASTE_CATEGORY_ACTIVATE' : 'WASTE_CATEGORY_DEACTIVATE', module: 'CONFIG', entity: 'waste_category', entityId: id, ...ctx });
  return { ok: true };
}
export async function deleteWasteCategory(user: SessionUser, id: string, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const used = await prisma.wasteEntryItem.count({ where: { categoryId: id } });
  if (used > 0) return { ok: false, reason: 'BLOCKED' }; // tem histórico → inative
  await prisma.wasteCategory.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, action: 'WASTE_CATEGORY_DELETE', module: 'CONFIG', entity: 'waste_category', entityId: id, ...ctx });
  return { ok: true };
}

/* ──────────────────────── Comandas: sequências por unidade (várias) ──── */
function validRange(s: number, e: number) { return Number.isFinite(s) && Number.isFinite(e) && s >= 0 && e >= s; }

export async function createCommandSequence(user: SessionUser, input: { unitId: string; name?: string; rangeStart: number; rangeEnd: number }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const start = Math.trunc(input.rangeStart), end = Math.trunc(input.rangeEnd);
  if (!input.unitId || !validRange(start, end)) return { ok: false, reason: 'INVALID' };
  const colide = acharSobreposicao({ rangeStart: start, rangeEnd: end }, await faixasAtivas(input.unitId));
  if (colide) return { ok: false, reason: 'CONFLICT', message: mensagemDeSobreposicao({ rangeStart: start, rangeEnd: end }, colide) };
  const count = await prisma.commandSequence.count({ where: { unitId: input.unitId } });
  const c = await prisma.commandSequence.create({ data: { unitId: input.unitId, name: input.name?.trim() || `Sequência ${count + 1}`, rangeStart: start, rangeEnd: end, order: count } });
  await audit({ userId: user.id, unitId: input.unitId, action: 'COMMAND_SEQ_CREATE', module: 'CONFIG', entity: 'command_sequence', entityId: c.id, metadata: { start, end }, ...ctx });
  return { ok: true, id: c.id };
}
export async function updateCommandSequence(user: SessionUser, id: string, input: { name?: string; rangeStart?: number; rangeEnd?: number; active?: boolean; nightly?: boolean }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const cur = await prisma.commandSequence.findUnique({ where: { id } });
  if (!cur) return { ok: false, reason: 'INVALID' };
  const start = input.rangeStart !== undefined ? Math.trunc(input.rangeStart) : cur.rangeStart;
  const end = input.rangeEnd !== undefined ? Math.trunc(input.rangeEnd) : cur.rangeEnd;
  if (!validRange(start, end)) return { ok: false, reason: 'INVALID' };
  /* Checa o estado RESULTANTE: mudar a faixa de uma ativa, ou reativar uma que
     dormia sobreposta, são o mesmo problema visto de dois ângulos. */
  const ficaraAtiva = input.active !== undefined ? input.active : cur.active;
  if (ficaraAtiva) {
    const colide = acharSobreposicao({ rangeStart: start, rangeEnd: end }, await faixasAtivas(cur.unitId), id);
    if (colide) return { ok: false, reason: 'CONFLICT', message: mensagemDeSobreposicao({ rangeStart: start, rangeEnd: end }, colide) };
  }
  await prisma.commandSequence.update({ where: { id }, data: { ...(input.name !== undefined ? { name: input.name.trim() || cur.name } : {}), rangeStart: start, rangeEnd: end, ...(input.active !== undefined ? { active: input.active } : {}), ...(input.nightly !== undefined ? { nightly: input.nightly } : {}) } });
  await audit({ userId: user.id, unitId: cur.unitId, action: 'COMMAND_SEQ_UPDATE', module: 'CONFIG', entity: 'command_sequence', entityId: id, ...ctx });
  return { ok: true };
}
export async function deleteCommandSequence(user: SessionUser, id: string, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const c = await prisma.commandSequence.findUnique({ where: { id }, select: { unitId: true } });
  if (!c) return { ok: false, reason: 'INVALID' };
  await prisma.commandSequence.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, unitId: c.unitId, action: 'COMMAND_SEQ_DELETE', module: 'CONFIG', entity: 'command_sequence', entityId: id, ...ctx });
  return { ok: true };
}

/* ──────────────────────── Ocorrências: tipos e categorias ──────────── */
export async function createOccType(user: SessionUser, input: { name: string; isMaintenance?: boolean; isIT?: boolean }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.name?.trim()) return { ok: false, reason: 'INVALID' };
  let code = slugCode(input.name);
  if (await prisma.occurrenceType.findUnique({ where: { code } })) code = `${code}_${Date.now().toString().slice(-4)}`;
  const count = await prisma.occurrenceType.count();
  const t = await prisma.occurrenceType.create({ data: { name: input.name.trim(), code, order: count, isMaintenance: Boolean(input.isMaintenance), isIT: Boolean(input.isIT) } });
  await audit({ userId: user.id, action: 'OCC_TYPE_CREATE', module: 'CONFIG', entity: 'occurrence_type', entityId: t.id, ...ctx });
  return { ok: true, id: t.id };
}
export async function updateOccType(user: SessionUser, id: string, input: { name?: string; isMaintenance?: boolean; isIT?: boolean }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (input.name !== undefined && !input.name.trim()) return { ok: false, reason: 'INVALID' };
  await prisma.occurrenceType.update({ where: { id }, data: { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.isMaintenance !== undefined ? { isMaintenance: Boolean(input.isMaintenance) } : {}) } });
  await audit({ userId: user.id, action: 'OCC_TYPE_UPDATE', module: 'CONFIG', entity: 'occurrence_type', entityId: id, ...ctx });
  return { ok: true };
}
export async function toggleOccType(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.occurrenceType.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'OCC_TYPE_ACTIVATE' : 'OCC_TYPE_DEACTIVATE', module: 'CONFIG', entity: 'occurrence_type', entityId: id, ...ctx });
  return { ok: true };
}
export async function deleteOccType(user: SessionUser, id: string, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const used = await prisma.occurrence.count({ where: { typeId: id } });
  if (used > 0) return { ok: false, reason: 'BLOCKED' };
  await prisma.occurrenceType.delete({ where: { id } }).catch(() => {}); // categorias em cascade
  await audit({ userId: user.id, action: 'OCC_TYPE_DELETE', module: 'CONFIG', entity: 'occurrence_type', entityId: id, ...ctx });
  return { ok: true };
}
export async function createOccCategory(user: SessionUser, input: { typeId: string; name: string }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.typeId || !input.name?.trim()) return { ok: false, reason: 'INVALID' };
  const count = await prisma.occurrenceCategory.count({ where: { typeId: input.typeId } });
  const c = await prisma.occurrenceCategory.create({ data: { typeId: input.typeId, name: input.name.trim(), order: count } });
  await audit({ userId: user.id, action: 'OCC_CATEGORY_CREATE', module: 'CONFIG', entity: 'occurrence_category', entityId: c.id, ...ctx });
  return { ok: true, id: c.id };
}
export async function updateOccCategory(user: SessionUser, id: string, input: { name?: string }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (input.name !== undefined && !input.name.trim()) return { ok: false, reason: 'INVALID' };
  await prisma.occurrenceCategory.update({ where: { id }, data: { ...(input.name !== undefined ? { name: input.name.trim() } : {}) } });
  await audit({ userId: user.id, action: 'OCC_CATEGORY_UPDATE', module: 'CONFIG', entity: 'occurrence_category', entityId: id, ...ctx });
  return { ok: true };
}
export async function toggleOccCategory(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.occurrenceCategory.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'OCC_CATEGORY_ACTIVATE' : 'OCC_CATEGORY_DEACTIVATE', module: 'CONFIG', entity: 'occurrence_category', entityId: id, ...ctx });
  return { ok: true };
}
export async function deleteOccCategory(user: SessionUser, id: string, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const used = await prisma.occurrence.count({ where: { categoryId: id } });
  if (used > 0) return { ok: false, reason: 'BLOCKED' };
  await prisma.occurrenceCategory.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, action: 'OCC_CATEGORY_DELETE', module: 'CONFIG', entity: 'occurrence_category', entityId: id, ...ctx });
  return { ok: true };
}

/* ──────────────────────── Checklists (templates) ──────────────────── */
export interface ChecklistItemInput { section?: string | null; text: string; requiresPhoto?: boolean; aiCheck?: boolean; standardDescription?: string | null }
type Scope = 'UNIT' | 'MANAGER';

function normLimit(v?: string | null): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return /^\d{1,2}:\d{2}$/.test(s) ? s : null; // vazio/invalido = sem horário
}
function normDate(v?: string | null): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; // vazio/invalido = sem data
}
function normItems(items?: ChecklistItemInput[]) {
  return (items ?? [])
    .filter((i) => i.text?.trim())
    .map((i, order) => ({
      section: i.section?.trim() || null,
      text: i.text.trim(),
      requiresPhoto: Boolean(i.requiresPhoto),
      order,
      aiCheck: Boolean(i.aiCheck) && Boolean(i.standardDescription?.trim()),
      standardDescription: i.standardDescription?.trim() || null,
    }));
}

/** Cria checklist(s). Pode replicar para várias unidades (uma cópia por unidade, ligadas por groupKey). */
export async function createTemplate(
  user: SessionUser,
  input: { unitId?: string; unitIds?: string[]; name: string; limitTime?: string | null; weight?: number; scope?: Scope; requiresEvidence?: boolean; entersMeta?: boolean; startDate?: string | null; endDate?: string | null; items?: ChecklistItemInput[] },
  ctx: Ctx = {},
): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const unitIds = (input.unitIds?.length ? input.unitIds : input.unitId ? [input.unitId] : []).filter(Boolean);
  if (!input.name?.trim() || unitIds.length === 0) return { ok: false, reason: 'INVALID' };
  const items = normItems(input.items);
  const common = {
    name: input.name.trim(),
    limitTime: normLimit(input.limitTime),
    weight: Number.isFinite(input.weight) ? Math.max(0, Math.trunc(input.weight as number)) : 1,
    scope: (input.scope === 'MANAGER' ? 'MANAGER' : 'UNIT') as Scope,
    requiresEvidence: Boolean(input.requiresEvidence),
    entersMeta: input.entersMeta ?? true,
    startDate: normDate(input.startDate),
    endDate: normDate(input.endDate),
  };
  const groupKey = unitIds.length > 1 ? crypto.randomUUID() : null;
  let firstId: string | undefined;
  for (const unitId of unitIds) {
    const t = await prisma.taskTemplate.create({
      data: { unitId, groupKey, ...common, items: items.length ? { create: items.map((i) => ({ ...i })) } : undefined },
    });
    firstId = firstId ?? t.id;
    await audit({ userId: user.id, unitId, action: 'TEMPLATE_CREATE', module: 'CONFIG', entity: 'task_template', entityId: t.id, metadata: { scope: common.scope, items: items.length, groupKey }, ...ctx });
  }
  return { ok: true, id: firstId };
}

/** Modelos prontos (padrão de restaurante) — criados sob demanda pelo Admin numa unidade. */
const EXAMPLE_CHECKLISTS: { name: string; limitTime: string | null; weight: number; scope: Scope; requiresEvidence: boolean; items: ChecklistItemInput[] }[] = [
  {
    name: 'Abertura do restaurante', limitTime: '11:00', weight: 20, scope: 'UNIT', requiresEvidence: false,
    items: [
      { section: 'Salão', text: 'Mesas montadas e organizadas' }, { section: 'Salão', text: 'Iluminação, som e climatização ligados' },
      { section: 'Caixa', text: 'Fundo de troco conferido' }, { section: 'Caixa', text: 'Sistema/PDV operacional' },
      { section: 'Cozinha', text: 'Mise en place pronto' }, { section: 'Cozinha', text: 'Equipamentos ligados e na temperatura' },
      { section: 'Churrasqueira', text: 'Fogo/brasa preparados', requiresPhoto: true }, { section: 'Bar', text: 'Estoque de bebidas e gelo conferido' },
      { section: 'Limpeza', text: 'Banheiros limpos e abastecidos' },
    ],
  },
  {
    name: 'Fechamento do restaurante', limitTime: null, weight: 20, scope: 'UNIT', requiresEvidence: false,
    items: [
      { section: 'Caixa', text: 'Caixa fechado e conferido' }, { section: 'Cozinha', text: 'Sobras armazenadas e identificadas' },
      { section: 'Cozinha', text: 'Equipamentos desligados' }, { section: 'Salão', text: 'Salão limpo e organizado' },
      { section: 'Geral', text: 'Luzes apagadas e portas trancadas' },
    ],
  },
  {
    name: 'Segurança alimentar — temperaturas', limitTime: '12:00', weight: 15, scope: 'UNIT', requiresEvidence: true,
    items: [
      { section: 'Freezer', text: 'Temperatura do freezer dentro do padrão', requiresPhoto: true },
      { section: 'Câmara fria', text: 'Temperatura da câmara dentro do padrão', requiresPhoto: true },
      { section: 'Validades', text: 'Validades conferidas (sem itens vencidos)' },
      { section: 'Higiene', text: 'Higienização de bancadas e utensílios' },
    ],
  },
  {
    name: 'Padrão de vitrine / exposição', limitTime: '11:30', weight: 10, scope: 'UNIT', requiresEvidence: true,
    items: [
      { section: 'Vitrine', text: 'Produtos organizados conforme o padrão', requiresPhoto: true },
      { section: 'Vitrine', text: 'Etiquetas/preços corretos' },
    ],
  },
  {
    name: 'Início de jornada do gerente', limitTime: null, weight: 10, scope: 'MANAGER', requiresEvidence: false,
    items: [
      { section: null, text: 'Equipe presente e uniformizada' }, { section: null, text: 'Avisos do dia repassados' },
      { section: null, text: 'Pendências do dia anterior verificadas' },
    ],
  },
];

/** Metadados leves dos modelos prontos (para o seletor na UI). */
export function exampleChecklistOptions() {
  return EXAMPLE_CHECKLISTS.map((c) => ({
    name: c.name,
    scope: c.scope,
    limitTime: c.limitTime,
    requiresEvidence: c.requiresEvidence,
    weight: c.weight,
    itemCount: c.items.length,
    sections: [...new Set(c.items.map((i) => i.section).filter(Boolean))] as string[],
  }));
}

/**
 * Cria modelos prontos numa unidade. Se `names` for informado, cria apenas os
 * selecionados; senão, todos. Pula os que já existem (não duplica).
 */
export async function seedExampleChecklists(user: SessionUser, unitId: string, names: string[] | undefined, ctx: Ctx = {}): Promise<AdminResult & { created?: number }> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!unitId) return { ok: false, reason: 'INVALID' };
  const wanted = names && names.length ? new Set(names) : null;
  const existing = new Set((await prisma.taskTemplate.findMany({ where: { unitId }, select: { name: true } })).map((t) => t.name));
  let created = 0;
  for (const c of EXAMPLE_CHECKLISTS) {
    if (wanted && !wanted.has(c.name)) continue; // não selecionado
    if (existing.has(c.name)) continue; // não duplica
    await prisma.taskTemplate.create({
      data: {
        unitId, name: c.name, limitTime: c.limitTime, weight: c.weight, scope: c.scope, requiresEvidence: c.requiresEvidence,
        items: { create: normItems(c.items).map((i) => ({ ...i })) },
      },
    });
    created++;
  }
  await audit({ userId: user.id, unitId, action: 'TEMPLATE_SEED_EXAMPLES', module: 'CONFIG', entity: 'task_template', metadata: { created, selected: wanted ? wanted.size : 'all' }, ...ctx });
  return { ok: true, created };
}

export async function toggleTemplate(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.taskTemplate.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'TEMPLATE_ACTIVATE' : 'TEMPLATE_DEACTIVATE', module: 'CONFIG', entity: 'task_template', entityId: id, ...ctx });
  return { ok: true };
}

export async function updateTemplate(
  user: SessionUser,
  id: string,
  input: { name?: string; limitTime?: string | null; weight?: number; scope?: Scope; requiresEvidence?: boolean; entersMeta?: boolean; startDate?: string | null; endDate?: string | null; items?: ChecklistItemInput[] },
  ctx: Ctx = {},
): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (input.name !== undefined && !input.name.trim()) return { ok: false, reason: 'INVALID' };
  await prisma.$transaction(async (tx) => {
    await tx.taskTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.limitTime !== undefined ? { limitTime: normLimit(input.limitTime) } : {}),
        ...(input.weight !== undefined ? { weight: Number.isFinite(input.weight) ? Math.max(0, Math.trunc(input.weight as number)) : 1 } : {}),
        ...(input.scope !== undefined ? { scope: (input.scope === 'MANAGER' ? 'MANAGER' : 'UNIT') as Scope } : {}),
        ...(input.requiresEvidence !== undefined ? { requiresEvidence: Boolean(input.requiresEvidence) } : {}),
        ...(input.entersMeta !== undefined ? { entersMeta: Boolean(input.entersMeta) } : {}),
        ...(input.startDate !== undefined ? { startDate: normDate(input.startDate) } : {}),
        ...(input.endDate !== undefined ? { endDate: normDate(input.endDate) } : {}),
      },
    });
    if (input.items !== undefined) {
      await tx.checklistItem.deleteMany({ where: { templateId: id } });
      const items = normItems(input.items);
      if (items.length) await tx.checklistItem.createMany({ data: items.map((i) => ({ templateId: id, ...i })) });
    }
  });
  await audit({ userId: user.id, action: 'TEMPLATE_UPDATE', module: 'CONFIG', entity: 'task_template', entityId: id, ...ctx });
  return { ok: true };
}

export async function deleteTemplate(user: SessionUser, id: string, ctx: Ctx = {}, opts: { force?: boolean } = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  // Excluir o template apaga (Cascade) todas as tarefas já geradas dele — perde
  // histórico e metas. Por padrão BLOQUEIA se houver execuções (o correto é
  // INATIVAR). Com force=true (ex.: limpar checklist de teste), exclui tudo em
  // cascade (instâncias, respostas, fotos) — auditado.
  const used = await prisma.taskInstance.count({ where: { templateId: id } });
  if (used > 0 && !opts.force) return { ok: false, reason: 'BLOCKED' };
  await prisma.taskTemplate.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, action: 'TEMPLATE_DELETE', module: 'CONFIG', entity: 'task_template', entityId: id, metadata: { forced: Boolean(opts.force), instances: used }, ...ctx });
  return { ok: true };
}

/** Duplica um checklist na MESMA unidade (cópia independente, com os itens). */
export async function duplicateTemplate(user: SessionUser, id: string, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const t = await prisma.taskTemplate.findUnique({ where: { id }, include: { items: { orderBy: { order: 'asc' } } } });
  if (!t) return { ok: false, reason: 'INVALID' };
  // nome único na unidade: "(cópia)", "(cópia 2)"…
  const names = new Set((await prisma.taskTemplate.findMany({ where: { unitId: t.unitId }, select: { name: true } })).map((x) => x.name));
  let name = `${t.name} (cópia)`;
  for (let n = 2; names.has(name); n++) name = `${t.name} (cópia ${n})`;
  const copy = await prisma.taskTemplate.create({
    data: {
      unitId: t.unitId, name, limitTime: t.limitTime, weight: t.weight, scope: t.scope,
      requiresEvidence: t.requiresEvidence, entersMeta: t.entersMeta, startDate: t.startDate, endDate: t.endDate,
      items: t.items.length ? { create: t.items.map((i) => ({ section: i.section, text: i.text, requiresPhoto: i.requiresPhoto, order: i.order, aiCheck: i.aiCheck, standardDescription: i.standardDescription })) } : undefined,
    },
  });
  await audit({ userId: user.id, unitId: t.unitId, action: 'TEMPLATE_DUPLICATE', module: 'CONFIG', entity: 'task_template', entityId: copy.id, metadata: { from: id }, ...ctx });
  return { ok: true, id: copy.id };
}

/**
 * Redefine em quais unidades um checklist aparece (mantém o "grupo" por groupKey).
 * Adiciona uma cópia (config + itens) nas novas unidades; nas removidas, exclui
 * se nunca gerou execução, senão INATIVA (preserva histórico/metas).
 */
export async function setTemplateUnits(user: SessionUser, id: string, unitIds: string[], ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const targets = [...new Set((unitIds ?? []).filter(Boolean))];
  if (targets.length === 0) return { ok: false, reason: 'INVALID' };
  const tpl = await prisma.taskTemplate.findUnique({ where: { id }, include: { items: { orderBy: { order: 'asc' } } } });
  if (!tpl) return { ok: false, reason: 'INVALID' };

  // Garante uma âncora de grupo
  let groupKey = tpl.groupKey;
  if (!groupKey) { groupKey = crypto.randomUUID(); await prisma.taskTemplate.update({ where: { id }, data: { groupKey } }); }

  const group = await prisma.taskTemplate.findMany({ where: { groupKey }, select: { id: true, unitId: true } });
  const current = new Map(group.map((g) => [g.unitId, g.id]));
  const targetSet = new Set(targets);

  // Adiciona / reativa
  for (const unitId of targets) {
    const existingId = current.get(unitId);
    if (existingId) { await prisma.taskTemplate.update({ where: { id: existingId }, data: { active: true } }); continue; }
    await prisma.taskTemplate.create({
      data: {
        unitId, groupKey, name: tpl.name, limitTime: tpl.limitTime, weight: tpl.weight, scope: tpl.scope,
        requiresEvidence: tpl.requiresEvidence, entersMeta: tpl.entersMeta,
        items: tpl.items.length ? { create: tpl.items.map((i) => ({ section: i.section, text: i.text, requiresPhoto: i.requiresPhoto, order: i.order, aiCheck: i.aiCheck, standardDescription: i.standardDescription })) } : undefined,
      },
    });
  }
  // Remove (excluir se sem histórico; senão inativar)
  for (const [unitId, tid] of current) {
    if (targetSet.has(unitId)) continue;
    const used = await prisma.taskInstance.count({ where: { templateId: tid } });
    if (used > 0) await prisma.taskTemplate.update({ where: { id: tid }, data: { active: false } });
    else await prisma.taskTemplate.delete({ where: { id: tid } }).catch(() => {});
  }
  await audit({ userId: user.id, action: 'TEMPLATE_SET_UNITS', module: 'CONFIG', entity: 'task_template', entityId: id, metadata: { groupKey, units: targets.length }, ...ctx });
  return { ok: true };
}

/* ──────────────────────── Pagamentos: cadastros ───────────────────── */
export async function createFreelancer(user: SessionUser, input: { name: string; defaultValue: number; pixKey?: string; unitIds: string[] }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.name?.trim() || !(input.defaultValue > 0) || !input.pixKey?.trim() || input.unitIds.length === 0) return { ok: false, reason: 'INVALID' };
  const f = await prisma.freelancer.create({ data: { name: input.name.trim(), defaultValue: input.defaultValue, pixKey: input.pixKey.trim(), units: { create: input.unitIds.map((unitId) => ({ unitId })) } } });
  await audit({ userId: user.id, action: 'FREELANCER_CREATE', module: 'CONFIG', entity: 'freelancer', entityId: f.id, ...ctx });
  return { ok: true, id: f.id };
}

/** Cobertura de setor (16/07): define/atualiza o valor por DIA de um setor do freelancer. */
export async function setFreelancerSectorRate(user: SessionUser, input: { freelancerId: string; sectorName: string; dayValue: number }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const sector = input.sectorName?.trim();
  if (!input.freelancerId || !sector || !(input.dayValue > 0)) return { ok: false, reason: 'INVALID' };
  await prisma.freelancerSectorRate.upsert({
    where: { freelancerId_sectorName: { freelancerId: input.freelancerId, sectorName: sector } },
    create: { freelancerId: input.freelancerId, sectorName: sector, dayValue: input.dayValue },
    update: { dayValue: input.dayValue },
  });
  await audit({ userId: user.id, action: 'FREELANCER_SECTOR_RATE_SET', module: 'CONFIG', entity: 'freelancer', entityId: input.freelancerId, metadata: { sector, dayValue: input.dayValue }, ...ctx });
  return { ok: true };
}

export async function deleteFreelancerSectorRate(user: SessionUser, input: { freelancerId: string; sectorName: string }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.freelancerSectorRate.deleteMany({ where: { freelancerId: input.freelancerId, sectorName: input.sectorName } });
  await audit({ userId: user.id, action: 'FREELANCER_SECTOR_RATE_DELETE', module: 'CONFIG', entity: 'freelancer', entityId: input.freelancerId, metadata: { sector: input.sectorName }, ...ctx });
  return { ok: true };
}

export async function toggleFreelancer(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.freelancer.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'FREELANCER_ACTIVATE' : 'FREELANCER_DEACTIVATE', module: 'CONFIG', entity: 'freelancer', entityId: id, ...ctx });
  return { ok: true };
}

export async function updateFreelancer(user: SessionUser, id: string, input: { name?: string; defaultValue?: number; pixKey?: string; unitIds?: string[] }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (input.name !== undefined && !input.name.trim()) return { ok: false, reason: 'INVALID' };
  if (input.defaultValue !== undefined && !(input.defaultValue > 0)) return { ok: false, reason: 'INVALID' };
  if (input.pixKey !== undefined && !input.pixKey.trim()) return { ok: false, reason: 'INVALID' };
  if (input.unitIds !== undefined && input.unitIds.length === 0) return { ok: false, reason: 'INVALID' };
  await prisma.$transaction(async (tx) => {
    await tx.freelancer.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.defaultValue !== undefined ? { defaultValue: input.defaultValue } : {}),
        ...(input.pixKey !== undefined ? { pixKey: input.pixKey.trim() } : {}),
      },
    });
    if (input.unitIds !== undefined) {
      await tx.freelancerUnit.deleteMany({ where: { freelancerId: id } });
      await tx.freelancerUnit.createMany({ data: input.unitIds.map((unitId) => ({ freelancerId: id, unitId })), skipDuplicates: true });
    }
  });
  await audit({ userId: user.id, action: 'FREELANCER_UPDATE', module: 'CONFIG', entity: 'freelancer', entityId: id, ...ctx });
  return { ok: true };
}

export async function deleteFreelancer(user: SessionUser, id: string, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  // Pagamentos referenciam o freelancer (SetNull). Para preservar rastreio,
  // bloqueia se já houver pagamentos lançados; o correto é INATIVAR.
  const used = await prisma.paymentRequest.count({ where: { freelancerId: id } });
  if (used > 0) return { ok: false, reason: 'BLOCKED' };
  await prisma.freelancer.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, action: 'FREELANCER_DELETE', module: 'CONFIG', entity: 'freelancer', entityId: id, ...ctx });
  return { ok: true };
}

export async function createMiscType(user: SessionUser, input: { name: string; approverRole: Role }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.name?.trim() || !input.approverRole) return { ok: false, reason: 'INVALID' };
  const t = await prisma.miscPaymentType.create({ data: { name: input.name.trim(), approverRole: input.approverRole } });
  await audit({ userId: user.id, action: 'MISCTYPE_CREATE', module: 'CONFIG', entity: 'misc_payment_type', entityId: t.id, ...ctx });
  return { ok: true, id: t.id };
}

export async function toggleMiscType(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.miscPaymentType.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'MISCTYPE_ACTIVATE' : 'MISCTYPE_DEACTIVATE', module: 'CONFIG', entity: 'misc_payment_type', entityId: id, ...ctx });
  return { ok: true };
}

export async function updateMiscType(user: SessionUser, id: string, input: { name?: string; approverRole?: Role }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (input.name !== undefined && !input.name.trim()) return { ok: false, reason: 'INVALID' };
  await prisma.miscPaymentType.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.approverRole !== undefined ? { approverRole: input.approverRole } : {}),
    },
  });
  await audit({ userId: user.id, action: 'MISCTYPE_UPDATE', module: 'CONFIG', entity: 'misc_payment_type', entityId: id, ...ctx });
  return { ok: true };
}

export async function deleteMiscType(user: SessionUser, id: string, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const used = await prisma.paymentRequest.count({ where: { miscTypeId: id } });
  if (used > 0) return { ok: false, reason: 'BLOCKED' };
  await prisma.miscPaymentType.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, action: 'MISCTYPE_DELETE', module: 'CONFIG', entity: 'misc_payment_type', entityId: id, ...ctx });
  return { ok: true };
}

export async function createDelegation(user: SessionUser, input: { fromUserId: string; toUserId: string; startsAt: string; endsAt: string }, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  // Datas vêm como 'YYYY-MM-DD' (input date). Interpretar no fuso da operação:
  // início = 00:00 e fim = 23:59:59 do dia escolhido (não meia-noite UTC, que
  // encerrava a delegação um dia antes no horário de Brasília).
  const TZ = 'America/Sao_Paulo';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const start = dateOnly.test(input.startsAt ?? '') ? fromZonedTime(`${input.startsAt}T00:00:00`, TZ) : new Date(input.startsAt);
  const end = dateOnly.test(input.endsAt ?? '') ? fromZonedTime(`${input.endsAt}T23:59:59`, TZ) : new Date(input.endsAt);
  if (!input.fromUserId || !input.toUserId || input.fromUserId === input.toUserId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, reason: 'INVALID' };
  }
  const d = await prisma.approvalDelegation.create({ data: { fromUserId: input.fromUserId, toUserId: input.toUserId, startsAt: start, endsAt: end, createdById: user.id } });
  await audit({ userId: user.id, action: 'DELEGATION_CREATE', module: 'CONFIG', entity: 'approval_delegation', entityId: d.id, metadata: { from: input.fromUserId, to: input.toUserId }, ...ctx });
  return { ok: true, id: d.id };
}

export async function deleteDelegation(user: SessionUser, id: string, ctx: Ctx = {}): Promise<AdminResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.approvalDelegation.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, action: 'DELEGATION_DELETE', module: 'CONFIG', entity: 'approval_delegation', entityId: id, ...ctx });
  return { ok: true };
}
