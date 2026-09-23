import { prisma } from '@/lib/db/prisma';
import { atualizarProduto, podeGerirCatalogo } from '@/lib/products/ficha';
import { propagarSetorParaItensAbertos, STATUS_ABERTOS_NO_CD } from '@/lib/products/propagar-setor';
import type { SessionUser } from '@/lib/auth/session';

/**
 * PENDENTES DE CLASSIFICAÇÃO — o produto sem setor DENTRO de um pedido aberto.
 *
 * Um produto novo (o gerente cadastrou pelo pedido) não pode sumir do pedido
 * porque ainda não tem setor. Ele entra no balde "Pendentes de classificação"
 * do pedido; quando a Administração define o setor no cadastro, os itens dos
 * pedidos ABERTOS passam para a fila do setor certo — automaticamente
 * (`propagar-setor.ts`). E nunca cai em "Secos" por padrão: sem setor é
 * melhor que setor errado.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };

export { STATUS_ABERTOS_NO_CD };

export interface PendenteDeClassificacao {
  productId: string;
  name: string;
  /** Em quantos pedidos abertos este produto está sem setor. */
  pedidos: number;
  unidades: string[];
}

/** Produtos sem setor em pedidos abertos do CD — distintos, com onde aparecem. */
export async function pendentesDeClassificacao(): Promise<PendenteDeClassificacao[]> {
  const itens = await prisma.productRequestItem.findMany({
    where: { cdSectorId: null, request: { origin: 'CD', status: { in: [...STATUS_ABERTOS_NO_CD] } } },
    select: { productId: true, name: true, request: { select: { id: true, unitId: true } } },
  });
  if (itens.length === 0) return [];
  const unidades = new Map((await prisma.unit.findMany({ where: { id: { in: [...new Set(itens.map((i) => i.request.unitId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  const porProduto = new Map<string, PendenteDeClassificacao & { pedidoIds: Set<string> }>();
  for (const i of itens) {
    /* Item cujo produto foi excluído do catálogo não tem como ser classificado
       por aqui (não há cadastro para receber o setor) — agrupa pelo nome só
       para aparecer na lista, com productId vazio. */
    const chave = i.productId ?? `nome:${i.name}`;
    const atual = porProduto.get(chave) ?? { productId: i.productId ?? '', name: i.name, pedidos: 0, unidades: [], pedidoIds: new Set<string>() };
    atual.pedidoIds.add(i.request.id);
    const u = unidades.get(i.request.unitId) ?? '—';
    if (!atual.unidades.includes(u)) atual.unidades.push(u);
    porProduto.set(chave, atual);
  }
  return [...porProduto.values()]
    .map(({ pedidoIds, ...p }) => ({ ...p, pedidos: pedidoIds.size }))
    .sort((a, b) => b.pedidos - a.pedidos || a.name.localeCompare(b.name, 'pt-BR'));
}

export type ClassificarResult =
  | { ok: true; itensAtualizados: number }
  | { ok: false; reason: 'FORBIDDEN' | 'NAO_ENCONTRADO' | 'INVALID' | 'JA_USADO' | 'SEM_SETOR'; message?: string };

/** Define o setor no cadastro E leva para os pedidos abertos — a ação do bloco "Pendentes de classificação". */
export async function classificarProduto(user: SessionUser, productId: string, cdSectorId: string, ctx: Ctx = {}): Promise<ClassificarResult> {
  if (!podeGerirCatalogo(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!cdSectorId) return { ok: false, reason: 'INVALID' };
  /* Conta ANTES: `atualizarProduto` já propaga para os pedidos abertos (todo
     caminho que define setor propaga), então depois dela não sobra nada a
     contar. A segunda chamada abaixo é só rede de segurança — idempotente. */
  const itensAtualizados = await prisma.productRequestItem.count({
    where: { productId, cdSectorId: null, request: { origin: 'CD', status: { in: [...STATUS_ABERTOS_NO_CD] } } },
  });
  const r = await atualizarProduto(user, productId, { origin: 'CD', cdSectorId }, ctx);
  if (!r.ok) return r;
  await propagarSetorParaItensAbertos([productId], ctx);
  return { ok: true, itensAtualizados };
}
