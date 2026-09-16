import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Quem alcança o Controle de Pizzas.
 *
 * A matriz de perfis do SGO é por PERFIL, não por unidade: `viewableNavHrefs`,
 * `canOpenPath` e `guardaDaRota` recebem `role` e mais nada. Este módulo é o
 * primeiro que existe só para uma unidade, então o recorte por unidade mora
 * aqui e é aplicado nos dois lugares — some do menu e a tela recusa abrir.
 * Só esconder no menu deixaria qualquer gerente entrar digitando o endereço.
 */

export const PIZZAS_NAV = '/modulos/pizzas';

export interface UnidadeComPizzaria {
  id: string;
  name: string;
  timezone: string;
  cutoffHour: number;
  pizzaPublicToken: string | null;
}

/** O usuário alcança alguma unidade com pizzaria? */
export async function temUnidadeComPizzaria(user: SessionUser): Promise<boolean> {
  const n = await prisma.unit.count({ where: { active: true, hasPizzeria: true, ...unitScopeWhere(user, 'id') } });
  return n > 0;
}

/**
 * Tira o Controle de Pizzas da navegação de quem não tem pizzaria.
 *
 * Regra em UM lugar só: a sidebar (layout) e o hub do celular precisam somir
 * com o item pelo mesmo critério, e duas cópias divergiriam no primeiro ajuste.
 */
export function recortarPizzas(hrefs: string[], temPizzaria: boolean): string[] {
  return temPizzaria ? hrefs : hrefs.filter((href) => href !== PIZZAS_NAV);
}

/** Unidades com pizzaria que este usuário alcança. Vazio = o módulo não é dele. */
export async function unidadesComPizzaria(user: SessionUser): Promise<UnidadeComPizzaria[]> {
  return prisma.unit.findMany({
    where: { active: true, hasPizzeria: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, timezone: true, cutoffHour: true, pizzaPublicToken: true },
  });
}

/**
 * O segredo do link, criado na primeira vez que alguém abre o painel.
 *
 * Nasce aqui, e não numa coluna com valor fixo na migration, para que uma
 * unidade que ganhe pizzaria amanhã receba um segredo próprio sem deploy.
 */
export async function garantirTokenPublico(unitId: string): Promise<string> {
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { pizzaPublicToken: true } });
  if (unit?.pizzaPublicToken) return unit.pizzaPublicToken;
  const token = randomBytes(16).toString('hex');
  await prisma.unit.update({ where: { id: unitId }, data: { pizzaPublicToken: token } });
  return token;
}

/**
 * A unidade por trás de um link público. O token é a única credencial, então
 * a unidade sai daqui — nunca do corpo da requisição, que o navegador controla.
 */
export async function unidadePorToken(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.unit.findFirst({
    where: { pizzaPublicToken: token, hasPizzeria: true, active: true },
    select: { id: true, name: true, timezone: true, cutoffHour: true },
  });
}

/** Sabores ativos do catálogo da unidade. */
export async function saboresAtivos(unitId: string) {
  return prisma.pizzaFlavor.findMany({
    where: { unitId, active: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  });
}
