import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import { notifySupervisory, notifyUsers } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma, UtensilInventoryStatus } from '@prisma/client';
import { listarCatalogo } from './catalogo';
import {
  EDITAVEL, EM_ABERTO, PERFIS_RESPONSAVEL, PODE_AUDITAR, PODE_CONTAR, ROTULO_STATUS,
  faltamParaEnviar, motivoValido, nomeValido, normalizarQuantidade, proximoStatus, retrato, totalDeUtensilios,
  type StatusInventario,
} from './regras';

/**
 * INVENTÁRIO DE UTENSÍLIOS — o fluxo: abrir (ou retomar) a contagem da
 * unidade → salvar rascunho → enviar → o supervisor/coordenador confere,
 * aprova ou devolve com motivo → o gerente corrige e reenvia. Um inventário
 * em aberto por unidade de cada vez; aprovado é imutável; a unidade é
 * validada na SESSÃO, nunca no corpo; toda transição vira evento + Auditoria.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };
export type Motivo = 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID' | 'STATE' | 'INCOMPLETO';
export type Resultado = { ok: true; id: string; status: StatusInventario } | { ok: false; reason: Motivo; message?: string; faltam?: string[] };
type Erro = Extract<Resultado, { ok: false }>;
type InvComItens = Prisma.UtensilInventoryGetPayload<{ include: { items: true } }>;
/** Resultado do carregamento: ou o inventário, ou a recusa — nunca os dois. */
type Carregado = { erro: Erro; inv?: undefined } | { erro?: undefined; inv: InvComItens };

const LINK = '/modulos/inventario-utensilios';

export interface ItemEntrada { id?: string; name?: string; quantity?: unknown; note?: string | null }
export interface Preenchimento {
  managerId?: string;
  notes?: string | null;
  /** Itens já existentes (padrão e personalizados): id + quantidade (+ nota). */
  itens?: ItemEntrada[];
  /** Personalizados novos: nome + quantidade (+ nota). */
  novos?: ItemEntrada[];
  /** Personalizados a remover (só os `custom`). */
  remover?: string[];
}

/** Gerentes/coordenadores ativos vinculados à unidade — os "responsáveis" possíveis. */
export async function responsaveisDaUnidade(unitId: string) {
  return prisma.user.findMany({
    where: { active: true, role: { in: [...PERFIS_RESPONSAVEL] }, memberships: { some: { unitId } } },
    select: { id: true, name: true, role: true }, orderBy: { name: 'asc' },
  });
}

/** O inventário em aberto da unidade (rascunho, pendente ou em correção), se houver. */
export async function emAbertoDaUnidade(unitId: string) {
  return prisma.utensilInventory.findFirst({ where: { unitId, status: { in: [...EM_ABERTO] as UtensilInventoryStatus[] } }, orderBy: { createdAt: 'desc' }, select: { id: true, status: true } });
}

/**
 * Abre a contagem da unidade: devolve o inventário em aberto ou cria um
 * rascunho novo com os itens ATIVOS da lista padrão (quantidade nula = não
 * conferido). O responsável nasce como quem abriu, quando ele é gerente ou
 * coordenador da unidade; senão o primeiro da lista.
 */
export async function abrirContagem(user: SessionUser, unitId: string, ctx: Ctx = {}): Promise<Resultado> {
  if (!PODE_CONTAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  if (!unitId || !canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN', message: 'Unidade fora do seu acesso.' };
  const aberto = await emAbertoDaUnidade(unitId);
  if (aberto) return { ok: true, id: aberto.id, status: aberto.status };
  const [catalogo, responsaveis] = await Promise.all([listarCatalogo(true), responsaveisDaUnidade(unitId)]);
  const eu = responsaveis.find((r) => r.id === user.id);
  const resp = eu ?? responsaveis[0] ?? { id: user.id, name: user.name };
  const inv = await prisma.utensilInventory.create({
    data: {
      unitId, status: 'RASCUNHO', managerId: resp.id, managerName: resp.name, createdById: user.id, createdByName: user.name,
      items: { create: catalogo.map((c) => ({ catalogItemId: c.id, name: c.name, order: c.order, quantity: null, custom: false })) },
      events: { create: { kind: 'CRIADO', byId: user.id, byName: user.name } },
    },
  });
  await audit({ userId: user.id, unitId, action: 'UTENSIL_INV_CREATE', module: 'INVENTORY', entity: 'utensil_inventory', entityId: inv.id, ...ctx });
  return { ok: true, id: inv.id, status: 'RASCUNHO' };
}

async function carregarEditavel(user: SessionUser, id: string): Promise<Carregado> {
  const inv = await prisma.utensilInventory.findUnique({ where: { id }, include: { items: true } });
  if (!inv) return { erro: { ok: false as const, reason: 'NOT_FOUND' as const } };
  if (!canAccessUnit(user, inv.unitId) || !PODE_CONTAR.has(user.role)) return { erro: { ok: false as const, reason: 'FORBIDDEN' as const } };
  if (!EDITAVEL.has(inv.status as StatusInventario)) return { erro: { ok: false as const, reason: 'STATE' as const, message: `Inventário ${ROTULO_STATUS[inv.status as StatusInventario].toLowerCase()} não pode ser editado.` } };
  return { inv };
}

/** Aplica o preenchimento (quantidades, notas, personalizados, responsável) — sem mudar o status. */
async function aplicarPreenchimento(user: SessionUser, inv: InvComItens, p: Preenchimento): Promise<{ ok: true } | { ok: false; reason: Motivo; message: string }> {
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const porId = new Map(inv.items.map((i) => [i.id, i]));
  for (const e of p.itens ?? []) {
    const item = e.id ? porId.get(e.id) : undefined;
    if (!item) return { ok: false, reason: 'INVALID', message: 'Item não pertence a este inventário.' };
    const q = normalizarQuantidade(e.quantity);
    if (!q.ok) return { ok: false, reason: 'INVALID', message: `${item.name}: quantidade inválida (inteiro de 0 a 999.999).` };
    ops.push(prisma.utensilInventoryItem.update({ where: { id: item.id }, data: { quantity: q.valor, note: e.note?.toString().trim() || null } }));
  }
  const remover = new Set(p.remover ?? []);
  for (const id of remover) {
    const item = porId.get(id);
    if (!item || !item.custom) return { ok: false, reason: 'INVALID', message: 'Só um utensílio adicionado pode ser removido.' };
    ops.push(prisma.utensilInventoryItem.delete({ where: { id } }));
  }
  const nomes = inv.items.filter((i) => !remover.has(i.id)).map((i) => i.name);
  let ordem = inv.items.reduce((m, i) => Math.max(m, i.order), 0);
  for (const n of p.novos ?? []) {
    const v = nomeValido(String(n.name ?? ''), nomes);
    if (!v.ok) return { ok: false, reason: 'INVALID', message: v.motivo };
    const q = normalizarQuantidade(n.quantity);
    if (!q.ok) return { ok: false, reason: 'INVALID', message: `${v.nome}: quantidade inválida.` };
    nomes.push(v.nome); ordem += 1;
    ops.push(prisma.utensilInventoryItem.create({ data: { inventoryId: inv.id, name: v.nome, order: ordem, quantity: q.valor, custom: true, note: n.note?.toString().trim() || null } }));
  }
  const data: Prisma.UtensilInventoryUpdateInput = {};
  if (p.notes !== undefined) data.notes = (p.notes ?? '').toString().trim().slice(0, 2000) || null;
  if (p.managerId && p.managerId !== inv.managerId) {
    const resp = (await responsaveisDaUnidade(inv.unitId)).find((r) => r.id === p.managerId);
    if (!resp) return { ok: false, reason: 'INVALID', message: 'O responsável precisa ser gerente ou coordenador desta unidade.' };
    data.managerId = resp.id; data.managerName = resp.name;
  }
  if (Object.keys(data).length) ops.push(prisma.utensilInventory.update({ where: { id: inv.id }, data }));
  if (ops.length) await prisma.$transaction(ops);
  return { ok: true };
}

export async function salvarRascunho(user: SessionUser, id: string, p: Preenchimento, ctx: Ctx = {}): Promise<Resultado> {
  const c = await carregarEditavel(user, id);
  if (c.erro) return c.erro;
  const r = await aplicarPreenchimento(user, c.inv, p);
  if (!r.ok) return r;
  await audit({ userId: user.id, unitId: c.inv.unitId, action: 'UTENSIL_INV_SAVE', module: 'INVENTORY', entity: 'utensil_inventory', entityId: id, ...ctx });
  return { ok: true, id, status: c.inv.status as StatusInventario };
}

/**
 * Envia ao supervisor: salva o que veio, exige todo item preenchido (zero
 * vale, vazio não) e muda o status com `updateMany` condicionado — dois
 * cliques no botão não geram dois envios. Reenvio após devolução é
 * REENVIADO; o retrato dos itens vai no evento e o envio original fica.
 */
export async function enviarInventario(user: SessionUser, id: string, p: Preenchimento, ctx: Ctx = {}): Promise<Resultado> {
  const c = await carregarEditavel(user, id);
  if (c.erro) return c.erro;
  const r = await aplicarPreenchimento(user, c.inv, p);
  if (!r.ok) return r;
  const inv = (await prisma.utensilInventory.findUnique({ where: { id }, include: { items: { orderBy: { order: 'asc' } } } }))!;
  const faltam = faltamParaEnviar(inv.items);
  if (faltam.length) return { ok: false, reason: 'INCOMPLETO', message: `Preencha a quantidade de: ${faltam.join(', ')}.`, faltam };
  const novo = proximoStatus(inv.status as StatusInventario, 'enviar')!;
  const reenvio = inv.status === 'EM_CORRECAO';
  const agora = new Date();
  const feito = await prisma.utensilInventory.updateMany({
    where: { id, status: { in: ['RASCUNHO', 'EM_CORRECAO'] } },
    data: { status: novo, sentAt: agora, firstSentAt: inv.firstSentAt ?? agora, returnReason: null },
  });
  if (feito.count === 0) return { ok: false, reason: 'STATE', message: 'Este inventário já foi enviado.' };
  await prisma.utensilInventoryEvent.create({ data: { inventoryId: id, kind: reenvio ? 'REENVIADO' : 'ENVIADO', byId: user.id, byName: user.name, snapshot: retrato(inv.items) } });
  const unidade = await prisma.unit.findUnique({ where: { id: inv.unitId }, select: { name: true } });
  await audit({ userId: user.id, unitId: inv.unitId, action: reenvio ? 'UTENSIL_INV_RESEND' : 'UTENSIL_INV_SEND', module: 'INVENTORY', entity: 'utensil_inventory', entityId: id, metadata: { itens: inv.items.length, total: totalDeUtensilios(inv.items) }, ...ctx });
  await notifySupervisory({
    title: reenvio ? 'Inventário de utensílios reenviado' : 'Inventário de utensílios enviado',
    body: `${unidade?.name ?? 'Unidade'} · ${inv.managerName} · ${totalDeUtensilios(inv.items)} utensílios — aguardando auditoria.`,
    link: `${LINK}/${id}`, module: 'INVENTORY',
  }, inv.unitId);
  return { ok: true, id, status: novo };
}

async function carregarParaAuditar(user: SessionUser, id: string): Promise<Carregado> {
  const inv = await prisma.utensilInventory.findUnique({ where: { id }, include: { items: true } });
  if (!inv) return { erro: { ok: false as const, reason: 'NOT_FOUND' as const } };
  if (!canAccessUnit(user, inv.unitId) || !PODE_AUDITAR.has(user.role)) return { erro: { ok: false as const, reason: 'FORBIDDEN' as const } };
  if (inv.status !== 'PENDENTE') return { erro: { ok: false as const, reason: 'STATE' as const, message: `Só um inventário pendente de auditoria pode ser auditado (este está ${ROTULO_STATUS[inv.status as StatusInventario].toLowerCase()}).` } };
  return { inv };
}

/** Conferência opcional do supervisor: quantidade auditada por item + observação de auditoria. Não muda o status. */
export async function registrarConferencia(user: SessionUser, id: string, p: { auditadas?: Record<string, unknown>; observacao?: string | null }, ctx: Ctx = {}): Promise<Resultado> {
  const c = await carregarParaAuditar(user, id);
  if (c.erro) return c.erro;
  const porId = new Map(c.inv.items.map((i) => [i.id, i]));
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const [itemId, v] of Object.entries(p.auditadas ?? {})) {
    if (!porId.has(itemId)) return { ok: false, reason: 'INVALID', message: 'Item não pertence a este inventário.' };
    const q = normalizarQuantidade(v);
    if (!q.ok) return { ok: false, reason: 'INVALID', message: `${porId.get(itemId)!.name}: quantidade auditada inválida.` };
    ops.push(prisma.utensilInventoryItem.update({ where: { id: itemId }, data: { auditedQuantity: q.valor } }));
  }
  if (p.observacao !== undefined) ops.push(prisma.utensilInventory.update({ where: { id }, data: { auditNotes: (p.observacao ?? '').toString().trim().slice(0, 2000) || null, auditorId: user.id, auditorName: user.name } }));
  if (ops.length) await prisma.$transaction(ops);
  await prisma.utensilInventoryEvent.create({ data: { inventoryId: id, kind: 'AUDITADO', byId: user.id, byName: user.name, note: (p.observacao ?? '').toString().trim() || null } });
  await audit({ userId: user.id, unitId: c.inv.unitId, action: 'UTENSIL_INV_AUDIT', module: 'INVENTORY', entity: 'utensil_inventory', entityId: id, metadata: { itensConferidos: Object.keys(p.auditadas ?? {}).length }, ...ctx });
  return { ok: true, id, status: 'PENDENTE' };
}

export async function aprovarInventario(user: SessionUser, id: string, observacao: string | null | undefined, ctx: Ctx = {}): Promise<Resultado> {
  const c = await carregarParaAuditar(user, id);
  if (c.erro) return c.erro;
  const feito = await prisma.utensilInventory.updateMany({
    where: { id, status: 'PENDENTE' },
    data: { status: 'APROVADO', approvedAt: new Date(), auditorId: user.id, auditorName: user.name, ...(observacao?.trim() ? { auditNotes: observacao.trim().slice(0, 2000) } : {}) },
  });
  if (feito.count === 0) return { ok: false, reason: 'STATE', message: 'Este inventário já foi auditado.' };
  await prisma.utensilInventoryEvent.create({ data: { inventoryId: id, kind: 'APROVADO', byId: user.id, byName: user.name, note: observacao?.trim() || null } });
  await audit({ userId: user.id, unitId: c.inv.unitId, action: 'UTENSIL_INV_APPROVE', module: 'INVENTORY', entity: 'utensil_inventory', entityId: id, ...ctx });
  await notifyUsers([c.inv.managerId], { title: 'Inventário de utensílios aprovado', body: `Auditado por ${user.name}.`, link: `${LINK}/${id}`, module: 'INVENTORY' });
  return { ok: true, id, status: 'APROVADO' };
}

export async function devolverInventario(user: SessionUser, id: string, motivo: string | null | undefined, ctx: Ctx = {}): Promise<Resultado> {
  const c = await carregarParaAuditar(user, id);
  if (c.erro) return c.erro;
  if (!motivoValido(motivo)) return { ok: false, reason: 'INVALID', message: 'Informe o motivo da devolução (mínimo 5 caracteres).' };
  const m = motivo!.trim().slice(0, 1000);
  const feito = await prisma.utensilInventory.updateMany({ where: { id, status: 'PENDENTE' }, data: { status: 'EM_CORRECAO', returnReason: m, auditorId: user.id, auditorName: user.name } });
  if (feito.count === 0) return { ok: false, reason: 'STATE', message: 'Este inventário já foi auditado.' };
  await prisma.utensilInventoryEvent.create({ data: { inventoryId: id, kind: 'DEVOLVIDO', byId: user.id, byName: user.name, note: m } });
  await audit({ userId: user.id, unitId: c.inv.unitId, action: 'UTENSIL_INV_RETURN', module: 'INVENTORY', entity: 'utensil_inventory', entityId: id, metadata: { motivo: m }, ...ctx });
  await notifyUsers([c.inv.managerId], { title: 'Inventário de utensílios devolvido para correção', body: m, link: `${LINK}/${id}`, module: 'INVENTORY', critical: true });
  return { ok: true, id, status: 'EM_CORRECAO' };
}

/* ───────────────────────── leitura ───────────────────────── */

export interface FiltroHistorico { unitIds?: string[]; managerId?: string; de?: string; ate?: string; status?: StatusInventario | null }

export interface ResumoInventario {
  id: string; unitId: string; unidade: string; status: StatusInventario; managerId: string; managerName: string;
  criadoEm: Date; enviadoEm: Date | null; aprovadoEm: Date | null; auditorName: string | null; total: number; itens: number; divergentes: number;
}

export async function listarInventarios(user: SessionUser, f: FiltroHistorico = {}, limite = 200): Promise<ResumoInventario[]> {
  const where: Prisma.UtensilInventoryWhereInput = {
    AND: [
      unitScopeWhere(user, 'unitId'),
      f.unitIds?.length ? { unitId: { in: f.unitIds } } : {},
      f.managerId ? { managerId: f.managerId } : {},
      f.status ? { status: f.status } : {},
      f.de ? { createdAt: { gte: new Date(`${f.de}T00:00:00-03:00`) } } : {},
      f.ate ? { createdAt: { lte: new Date(`${f.ate}T23:59:59-03:00`) } } : {},
    ],
  };
  const rows = await prisma.utensilInventory.findMany({ where, orderBy: [{ createdAt: 'desc' }], take: limite, include: { items: { select: { quantity: true, auditedQuantity: true } } } });
  const unidades = await prisma.unit.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.unitId))] } }, select: { id: true, name: true } });
  const nome = new Map(unidades.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id, unitId: r.unitId, unidade: nome.get(r.unitId) ?? '—', status: r.status as StatusInventario, managerId: r.managerId, managerName: r.managerName,
    criadoEm: r.createdAt, enviadoEm: r.sentAt, aprovadoEm: r.approvedAt, auditorName: r.auditorName,
    total: totalDeUtensilios(r.items), itens: r.items.length,
    divergentes: r.items.filter((i) => i.quantity !== null && i.auditedQuantity !== null && i.quantity !== i.auditedQuantity).length,
  }));
}

/** Os três números do supervisor: pendentes e em correção são SEMPRE os atuais; aprovados são os do período. */
export async function indicadoresDeAuditoria(user: SessionUser, de: string, ate: string, unitIds?: string[]) {
  const escopo: Prisma.UtensilInventoryWhereInput = { AND: [unitScopeWhere(user, 'unitId'), unitIds?.length ? { unitId: { in: unitIds } } : {}] };
  const [pendentes, emCorrecao, aprovados] = await Promise.all([
    prisma.utensilInventory.count({ where: { ...escopo, status: 'PENDENTE' } }),
    prisma.utensilInventory.count({ where: { ...escopo, status: 'EM_CORRECAO' } }),
    prisma.utensilInventory.count({ where: { ...escopo, status: 'APROVADO', approvedAt: { gte: new Date(`${de}T00:00:00-03:00`), lte: new Date(`${ate}T23:59:59-03:00`) } } }),
  ]);
  return { pendentes, emCorrecao, aprovados };
}

export async function getInventario(user: SessionUser, id: string) {
  const inv = await prisma.utensilInventory.findUnique({ where: { id }, include: { items: { orderBy: [{ custom: 'asc' }, { order: 'asc' }] }, events: { orderBy: { createdAt: 'asc' } } } });
  if (!inv || !canAccessUnit(user, inv.unitId)) return null;
  const unidade = await prisma.unit.findUnique({ where: { id: inv.unitId }, select: { name: true } });
  return { ...inv, status: inv.status as StatusInventario, unidade: unidade?.name ?? '—', total: totalDeUtensilios(inv.items) };
}
export type InventarioDetalhe = NonNullable<Awaited<ReturnType<typeof getInventario>>>;

/** Para a meta (v1.177.0): a unidade ENVIOU um inventário de utensílios no mês? 1/0 — mensal ou trimestral, o Pedro calibra pelo peso. */
export async function getUtensilsCoverage(unitId: string, yearMonth: string): Promise<{ done: number; missed: number }> {
  const [y, m] = yearMonth.split('-').map(Number);
  const de = new Date(Date.UTC(y, m - 1, 1, 3)); const ate = new Date(Date.UTC(y, m, 1, 3));
  const n = await prisma.utensilInventory.count({ where: { unitId, status: { in: ['PENDENTE', 'EM_CORRECAO', 'APROVADO'] }, firstSentAt: { gte: de, lt: ate } } });
  return n > 0 ? { done: 1, missed: 0 } : { done: 0, missed: 1 };
}
