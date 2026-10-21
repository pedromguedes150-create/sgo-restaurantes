import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { ITENS_PADRAO, nomeValido } from './regras';

/**
 * Lista padrão de utensílios — GLOBAL (a mesma para todas as unidades), editada
 * pelo Admin em Configurações → Utensílios sem mexer em código. Semeada com os
 * 15 itens do pedido na primeira leitura; item usado em inventário não some do
 * histórico ao ser desativado, porque o inventário congela o nome.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoCatalogo = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND'; message?: string };
const PODE_EDITAR = new Set(['ADMIN', 'CEO']);

export async function ensureUtensiliosPadrao(): Promise<void> {
  const n = await prisma.utensilCatalogItem.count();
  if (n > 0) return;
  await prisma.utensilCatalogItem.createMany({ data: ITENS_PADRAO.map((name, i) => ({ name, order: i + 1 })) });
}

export async function listarCatalogo(somenteAtivos = false) {
  await ensureUtensiliosPadrao();
  return prisma.utensilCatalogItem.findMany({ where: somenteAtivos ? { active: true } : undefined, orderBy: [{ order: 'asc' }, { name: 'asc' }] });
}

export async function adicionarUtensilio(user: SessionUser, nome: string, ctx: Ctx = {}): Promise<ResultadoCatalogo> {
  if (!PODE_EDITAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const todos = await listarCatalogo();
  const v = nomeValido(nome, todos.map((t) => t.name));
  if (!v.ok) return { ok: false, reason: 'INVALID', message: v.motivo };
  const max = todos.reduce((m, t) => Math.max(m, t.order), 0);
  const c = await prisma.utensilCatalogItem.create({ data: { name: v.nome, order: max + 1 } });
  await audit({ userId: user.id, action: 'UTENSIL_CATALOG_ADD', module: 'CONFIG', entity: 'utensil_catalog_item', entityId: c.id, metadata: { nome: v.nome }, ...ctx });
  return { ok: true, id: c.id };
}

export async function renomearUtensilio(user: SessionUser, id: string, nome: string, ctx: Ctx = {}): Promise<ResultadoCatalogo> {
  if (!PODE_EDITAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.utensilCatalogItem.findUnique({ where: { id } });
  if (!atual) return { ok: false, reason: 'NOT_FOUND' };
  const outros = (await prisma.utensilCatalogItem.findMany({ where: { id: { not: id } }, select: { name: true } })).map((t) => t.name);
  const v = nomeValido(nome, outros);
  if (!v.ok) return { ok: false, reason: 'INVALID', message: v.motivo };
  await prisma.utensilCatalogItem.update({ where: { id }, data: { name: v.nome } });
  await audit({ userId: user.id, action: 'UTENSIL_CATALOG_RENAME', module: 'CONFIG', entity: 'utensil_catalog_item', entityId: id, metadata: { antes: atual.name, depois: v.nome }, ...ctx });
  return { ok: true };
}

export async function ativarUtensilio(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<ResultadoCatalogo> {
  if (!PODE_EDITAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.utensilCatalogItem.findUnique({ where: { id } });
  if (!atual) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.utensilCatalogItem.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'UTENSIL_CATALOG_ACTIVATE' : 'UTENSIL_CATALOG_DEACTIVATE', module: 'CONFIG', entity: 'utensil_catalog_item', entityId: id, metadata: { nome: atual.name }, ...ctx });
  return { ok: true };
}

/** Move uma posição para cima ou para baixo, trocando a ordem com o vizinho. */
export async function moverUtensilio(user: SessionUser, id: string, direcao: 'cima' | 'baixo', ctx: Ctx = {}): Promise<ResultadoCatalogo> {
  if (!PODE_EDITAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const todos = await listarCatalogo();
  const i = todos.findIndex((t) => t.id === id);
  if (i < 0) return { ok: false, reason: 'NOT_FOUND' };
  const j = direcao === 'cima' ? i - 1 : i + 1;
  if (j < 0 || j >= todos.length) return { ok: true };
  /* Reatribui a ordem inteira (1..n) trocando i e j: ordens repetidas herdadas não travam a troca. */
  const nova = [...todos]; [nova[i], nova[j]] = [nova[j], nova[i]];
  await prisma.$transaction(nova.map((t, k) => prisma.utensilCatalogItem.update({ where: { id: t.id }, data: { order: k + 1 } })));
  await audit({ userId: user.id, action: 'UTENSIL_CATALOG_REORDER', module: 'CONFIG', entity: 'utensil_catalog_item', entityId: id, metadata: { direcao }, ...ctx });
  return { ok: true };
}
