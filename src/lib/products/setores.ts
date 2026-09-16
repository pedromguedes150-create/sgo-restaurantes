import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Setores do Centro de Distribuição (Configurações).
 *
 * O setor já governava duas coisas desde os Pedidos Internos — para qual setor
 * cada produto vai (`Product.cdSectorId`) e qual separador enxerga o quê
 * (`User.cdSectorId`) — mas não havia tela: criar um setor exigia alguém com
 * acesso ao banco de produção. É o que esta camada resolve.
 *
 * Diferente do `Sector` do Mapa de Funções, o setor do CD é GLOBAL: o Centro de
 * Distribuição é um só para a rede, e não uma área dentro de cada restaurante.
 */

export type ResultadoSetor =
  | { ok: true; id?: string }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'CONFLICT' | 'BLOCKED'; message?: string };

/** Mesma linha do catálogo de produtos: Admin, CEO e Supervisão. */
function podeGerenciar(user: SessionUser) {
  return ['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role);
}

export interface SetorDoCd {
  id: string;
  name: string;
  active: boolean;
  order: number;
  produtos: number;
  separadores: number;
  itensEmPedidos: number;
}

export async function listarSetoresDoCd(): Promise<SetorDoCd[]> {
  const setores = await prisma.cdSector.findMany({
    orderBy: [{ active: 'desc' }, { order: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      active: true,
      order: true,
      _count: { select: { products: true, separators: true, requestItems: true } },
    },
  });
  return setores.map((s) => ({
    id: s.id,
    name: s.name,
    active: s.active,
    order: s.order,
    produtos: s._count.products,
    separadores: s._count.separators,
    itensEmPedidos: s._count.requestItems,
  }));
}

/** Só os ativos — é o que alimenta o seletor do cadastro de usuário. */
export async function setoresAtivosDoCd() {
  return prisma.cdSector.findMany({
    where: { active: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  });
}

export async function criarSetorDoCd(
  user: SessionUser,
  name: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoSetor> {
  if (!podeGerenciar(user)) return { ok: false, reason: 'FORBIDDEN' };
  const nome = name?.trim();
  if (!nome || nome.length > 80) return { ok: false, reason: 'INVALID' };

  const jaExiste = await prisma.cdSector.findUnique({ where: { name: nome } });
  if (jaExiste) return { ok: false, reason: 'CONFLICT', message: 'Já existe um setor com esse nome.' };

  const total = await prisma.cdSector.count();
  const s = await prisma.cdSector.create({ data: { name: nome, order: total } });
  await audit({ userId: user.id, action: 'CD_SECTOR_CREATE', module: 'CONFIG', entity: 'cd_sector', entityId: s.id, metadata: { name: nome }, ...ctx });
  return { ok: true, id: s.id };
}

export async function renomearSetorDoCd(
  user: SessionUser,
  input: { id: string; name: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoSetor> {
  if (!podeGerenciar(user)) return { ok: false, reason: 'FORBIDDEN' };
  const nome = input.name?.trim();
  if (!nome || nome.length > 80) return { ok: false, reason: 'INVALID' };

  const atual = await prisma.cdSector.findUnique({ where: { id: input.id }, select: { id: true } });
  if (!atual) return { ok: false, reason: 'INVALID' };
  const colide = await prisma.cdSector.findUnique({ where: { name: nome } });
  if (colide && colide.id !== input.id) return { ok: false, reason: 'CONFLICT', message: 'Já existe um setor com esse nome.' };

  /* Renomear não reescreve pedido antigo: `ProductRequestItem.cdSectorName` é
     o retrato do nome no dia, congelado de propósito lá no módulo de Pedidos. */
  await prisma.cdSector.update({ where: { id: input.id }, data: { name: nome } });
  await audit({ userId: user.id, action: 'CD_SECTOR_UPDATE', module: 'CONFIG', entity: 'cd_sector', entityId: input.id, metadata: { name: nome }, ...ctx });
  return { ok: true };
}

export async function alternarSetorDoCd(
  user: SessionUser,
  input: { id: string; active: boolean },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoSetor> {
  if (!podeGerenciar(user)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.cdSector.findUnique({
    where: { id: input.id },
    select: { _count: { select: { separators: true } } },
  });
  if (!atual) return { ok: false, reason: 'INVALID' };

  /* Desativar um setor que ainda tem separador deixaria aquele funcionário sem
     fila: a tela dele abre filtrada pelo setor e ficaria vazia sem explicação.
     Primeiro se move o pessoal, depois se fecha o setor. */
  if (!input.active && atual._count.separators > 0) {
    return {
      ok: false,
      reason: 'BLOCKED',
      message: `Há ${atual._count.separators} separador(es) vinculado(s) a este setor. Mude o setor deles em Configurações → Usuários antes de desativar.`,
    };
  }

  await prisma.cdSector.update({ where: { id: input.id }, data: { active: Boolean(input.active) } });
  await audit({ userId: user.id, action: 'CD_SECTOR_TOGGLE', module: 'CONFIG', entity: 'cd_sector', entityId: input.id, metadata: { active: input.active }, ...ctx });
  return { ok: true };
}

export async function excluirSetorDoCd(
  user: SessionUser,
  id: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoSetor> {
  if (!podeGerenciar(user)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.cdSector.findUnique({
    where: { id },
    select: { _count: { select: { products: true, separators: true, requestItems: true } } },
  });
  if (!atual) return { ok: false, reason: 'INVALID' };

  /* Em uso se DESATIVA, não se apaga. As FKs são `onDelete: SetNull`, então
     excluir não daria erro — soltaria os produtos sem setor e apagaria de qual
     setor cada item de pedido saiu. O estrago seria silencioso. */
  const { products, separators, requestItems } = atual._count;
  if (products + separators + requestItems > 0) {
    const partes = [
      products > 0 ? `${products} produto(s)` : null,
      separators > 0 ? `${separators} separador(es)` : null,
      requestItems > 0 ? `${requestItems} item(ns) de pedido` : null,
    ].filter(Boolean);
    return {
      ok: false,
      reason: 'BLOCKED',
      message: `Este setor está em uso por ${partes.join(', ')}. Desative-o em vez de excluir — assim ele sai dos cadastros novos e o histórico continua legível.`,
    };
  }

  await prisma.cdSector.delete({ where: { id } });
  await audit({ userId: user.id, action: 'CD_SECTOR_DELETE', module: 'CONFIG', entity: 'cd_sector', entityId: id, ...ctx });
  return { ok: true };
}
