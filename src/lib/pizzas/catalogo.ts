import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Catálogo de sabores da pizzaria (Configurações).
 *
 * O sabor é cadastro, e não texto digitado no fechamento, porque o cruzamento
 * futuro com a ficha técnica precisa de um item estável para somar: "Calabresa",
 * "calabreza" e "CALABRESA" digitados no dia a dia nunca casariam com uma
 * receita, e o consumo teórico de insumos sairia errado.
 */

export type ResultadoCatalogo =
  | { ok: true; id?: string }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'CONFLICT' | 'BLOCKED'; message?: string };

/** Quem mexe no catálogo: a mesma linha de Configurações do resto do sistema. */
function podeGerenciar(user: SessionUser) {
  return ['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role);
}

export async function listarSabores(user: SessionUser, unitId: string) {
  if (!canAccessUnit(user, unitId)) return [];
  const sabores = await prisma.pizzaFlavor.findMany({
    where: { unitId },
    orderBy: [{ active: 'desc' }, { order: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, active: true, order: true, _count: { select: { items: true } } },
  });
  return sabores.map((s) => ({ id: s.id, name: s.name, active: s.active, order: s.order, lancamentos: s._count.items }));
}

export async function criarSabor(
  user: SessionUser,
  input: { unitId: string; name: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoCatalogo> {
  if (!podeGerenciar(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const name = input.name?.trim();
  if (!name || name.length > 80) return { ok: false, reason: 'INVALID' };

  const unidade = await prisma.unit.findFirst({ where: { id: input.unitId, hasPizzeria: true }, select: { id: true } });
  if (!unidade) return { ok: false, reason: 'INVALID', message: 'Esta unidade não está marcada como tendo pizzaria.' };

  const jaExiste = await prisma.pizzaFlavor.findUnique({ where: { unitId_name: { unitId: input.unitId, name } } });
  if (jaExiste) return { ok: false, reason: 'CONFLICT', message: 'Já existe um sabor com esse nome.' };

  const total = await prisma.pizzaFlavor.count({ where: { unitId: input.unitId } });
  const s = await prisma.pizzaFlavor.create({ data: { unitId: input.unitId, name, order: total } });
  await audit({ userId: user.id, unitId: input.unitId, action: 'PIZZA_FLAVOR_CREATE', module: 'PIZZAS', entity: 'pizza_flavor', entityId: s.id, metadata: { name }, ...ctx });
  return { ok: true, id: s.id };
}

export async function renomearSabor(
  user: SessionUser,
  input: { id: string; name: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoCatalogo> {
  if (!podeGerenciar(user)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.pizzaFlavor.findUnique({ where: { id: input.id }, select: { unitId: true } });
  if (!atual || !canAccessUnit(user, atual.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const name = input.name?.trim();
  if (!name || name.length > 80) return { ok: false, reason: 'INVALID' };

  const colide = await prisma.pizzaFlavor.findUnique({ where: { unitId_name: { unitId: atual.unitId, name } } });
  if (colide && colide.id !== input.id) return { ok: false, reason: 'CONFLICT', message: 'Já existe um sabor com esse nome.' };

  /* Renomear NÃO reescreve o histórico: `PizzaClosingItem.flavorName` é o
     retrato do nome no dia do fechamento. Corrigir uma grafia hoje não pode
     mudar o que foi lançado há três meses. */
  await prisma.pizzaFlavor.update({ where: { id: input.id }, data: { name } });
  await audit({ userId: user.id, unitId: atual.unitId, action: 'PIZZA_FLAVOR_UPDATE', module: 'PIZZAS', entity: 'pizza_flavor', entityId: input.id, metadata: { name }, ...ctx });
  return { ok: true };
}

export async function alternarSabor(
  user: SessionUser,
  input: { id: string; active: boolean },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoCatalogo> {
  if (!podeGerenciar(user)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.pizzaFlavor.findUnique({ where: { id: input.id }, select: { unitId: true } });
  if (!atual || !canAccessUnit(user, atual.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.pizzaFlavor.update({ where: { id: input.id }, data: { active: Boolean(input.active) } });
  await audit({ userId: user.id, unitId: atual.unitId, action: 'PIZZA_FLAVOR_TOGGLE', module: 'PIZZAS', entity: 'pizza_flavor', entityId: input.id, metadata: { active: input.active }, ...ctx });
  return { ok: true };
}

export async function excluirSabor(
  user: SessionUser,
  id: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoCatalogo> {
  if (!podeGerenciar(user)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.pizzaFlavor.findUnique({ where: { id }, select: { unitId: true, _count: { select: { items: true } } } });
  if (!atual || !canAccessUnit(user, atual.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  /* Sabor com histórico se DESATIVA, não se apaga: excluir levaria junto as
     linhas de fechamento por FK e abriria um buraco no que já foi somado. */
  if (atual._count.items > 0) {
    return { ok: false, reason: 'BLOCKED', message: 'Este sabor já foi lançado. Desative-o em vez de excluir — assim ele sai do formulário e o histórico continua somando.' };
  }
  await prisma.pizzaFlavor.delete({ where: { id } });
  await audit({ userId: user.id, unitId: atual.unitId, action: 'PIZZA_FLAVOR_DELETE', module: 'PIZZAS', entity: 'pizza_flavor', entityId: id, ...ctx });
  return { ok: true };
}
