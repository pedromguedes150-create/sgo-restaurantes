import { prisma } from '@/lib/db/prisma';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import { quantidadeSugerida, ROTULO_EMBALAGEM, type TipoDeEmbalagem } from '@/lib/stock/embalagem';
import { rotuloDaQuantidade, type UnidadeDePedido } from '@/lib/products/embalagem-pedido';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O GANCHO ENTRE O PEDIDO E A PRATELEIRA (etapa 2 do Estoque).
 *
 * A carga chegou do CD e a unidade conferiu; a partir daí cada item pode virar
 * um lote do estoque — mas NÃO vira sozinho. A entrada do estoque exige o que a
 * conferência de recebimento não pergunta: em qual embalagem se conta, e a
 * VALIDADE do lote quando o produto a controla. Inventar a validade seria pior
 * que não ter lote; e o saldo do estoque é declaração, não dedução (v1.105.0).
 *
 * Então o que este arquivo faz é OFERECER: lista o que foi recebido e ainda não
 * foi lançado, com a quantidade já sugerida quando a embalagem bate, e deixa a
 * pessoa confirmar item a item. `ProductRequestItem.stockedAt` é o que impede
 * lançar duas vezes — e o que permite saber o que ficou para trás.
 */

/** Pedidos recebidos há mais tempo que isto deixam de cobrar lançamento. */
export const DIAS_PARA_LANCAR = 30;

const STATUS_RECEBIDO = ['CONCLUIDO', 'CONCLUIDO_DIVERGENCIA'];

export interface ItemParaEstoque {
  itemId: string;
  productId: string;
  nome: string;
  /** "2 fardos" — como foi pedido/separado, para a pessoa se reconhecer. */
  recebido: string;
  quantidadeRecebida: number | null;
  /** Como o ESTOQUE conta este produto. */
  tipoDoEstoque: TipoDeEmbalagem;
  rotuloDoEstoque: string;
  unitsPerPack: number;
  quantidadeSugerida: number | null;
  exigeValidade: boolean;
  /** Já lançado: em que lote e quando. */
  lancadoEm: Date | null;
  stockLotId: string | null;
  /** Produto desativado ou sem cadastro: não há como lançar. */
  bloqueio: 'PRODUTO_INATIVO' | null;
}

export interface RecebimentoParaEstoque {
  requestId: string;
  unitId: string;
  recebidoEm: Date | null;
  itens: ItemParaEstoque[];
  pendentes: number;
}

/** Os itens de um pedido RECEBIDO, prontos para virar lote — pela porta da unidade. */
export async function itensParaEstoque(user: SessionUser, requestId: string): Promise<RecebimentoParaEstoque | null> {
  const pedido = await prisma.productRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true, unitId: true, status: true, receivedAt: true,
      requestItems: {
        orderBy: { name: 'asc' },
        select: {
          id: true, productId: true, name: true, measure: true, packUnit: true,
          qtyRequested: true, qtySeparated: true, stockedAt: true, stockLotId: true,
          product: { select: { id: true, active: true, packType: true, packSize: true, trackExpiry: true } },
        },
      },
    },
  });
  if (!pedido) return null;
  if (!canAccessUnit(user, pedido.unitId)) return null;
  if (!STATUS_RECEBIDO.includes(pedido.status)) return null;

  const itens: ItemParaEstoque[] = [];
  for (const i of pedido.requestItems) {
    /* Item sem produto (cadastro apagado) não tem onde entrar. Falta total no
       CD (separou zero) não chegou — e não vira lote. */
    if (!i.productId || !i.product) continue;
    const recebidaNum = i.qtySeparated === null ? Number(i.qtyRequested) : Number(i.qtySeparated);
    if (recebidaNum <= 0) continue;
    const tipo = i.product.packType as TipoDeEmbalagem;
    const unitsPerPack = tipo === 'UN' ? 1 : Math.max(1, i.product.packSize ?? 1);
    itens.push({
      itemId: i.id,
      productId: i.productId,
      nome: i.name,
      recebido: rotuloDaQuantidade(recebidaNum, i.packUnit as UnidadeDePedido, i.measure),
      quantidadeRecebida: recebidaNum,
      tipoDoEstoque: tipo,
      rotuloDoEstoque: ROTULO_EMBALAGEM[tipo].plural,
      unitsPerPack,
      quantidadeSugerida: quantidadeSugerida(i.packUnit, tipo, recebidaNum),
      exigeValidade: i.product.trackExpiry,
      lancadoEm: i.stockedAt,
      stockLotId: i.stockLotId,
      bloqueio: i.product.active ? null : 'PRODUTO_INATIVO',
    });
  }
  return {
    requestId: pedido.id,
    unitId: pedido.unitId,
    recebidoEm: pedido.receivedAt,
    itens,
    pendentes: itens.filter((i) => !i.lancadoEm && !i.bloqueio).length,
  };
}

export interface RecebimentoPendente {
  requestId: string;
  number: number;
  createdAt: Date;
  recebidoEm: Date;
  itensPendentes: number;
}

/**
 * Pedidos recebidos nos últimos `DIAS_PARA_LANCAR` dias com item ainda não
 * lançado — a cobrança que a tela do Estoque mostra. O corte por dias existe
 * porque um pedido de três meses atrás já foi consumido: cobrar o lançamento
 * dele ensinaria a ignorar a cobrança.
 */
export async function recebimentosPendentesDeEstoque(user: SessionUser, unitId: string): Promise<RecebimentoPendente[]> {
  if (!canAccessUnit(user, unitId)) return [];
  const desde = new Date(Date.now() - DIAS_PARA_LANCAR * 86_400_000);
  const pedidos = await prisma.productRequest.findMany({
    where: {
      unitId, ...unitScopeWhere(user, 'unitId'),
      status: { in: STATUS_RECEBIDO },
      receivedAt: { gte: desde },
      requestItems: { some: { stockedAt: null, productId: { not: null }, product: { active: true } } },
    },
    orderBy: { receivedAt: 'desc' },
    select: {
      id: true, number: true, createdAt: true, receivedAt: true,
      requestItems: { where: { stockedAt: null, productId: { not: null }, product: { active: true } }, select: { qtyRequested: true, qtySeparated: true } },
    },
  });
  return pedidos
    .map((p) => ({
      requestId: p.id, number: p.number, createdAt: p.createdAt, recebidoEm: p.receivedAt as Date,
      itensPendentes: p.requestItems.filter((i) => (i.qtySeparated === null ? Number(i.qtyRequested) : Number(i.qtySeparated)) > 0).length,
    }))
    .filter((p) => p.itensPendentes > 0);
}
