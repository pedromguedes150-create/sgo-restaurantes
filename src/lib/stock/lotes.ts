import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { emUnidades, type TipoDeEmbalagem } from '@/lib/stock/embalagem';
import { bandaDaFaixa, faixaDaValidade } from '@/lib/stock/validade';
import { registrarMovimento as mover, type Tx } from '@/lib/stock/movimento';
import { transferirLote } from '@/lib/stock/transferencia';
import type { SessionUser } from '@/lib/auth/session';
import type { PackType, StockMoveType } from '@prisma/client';

/**
 * LOTES — entrada, contagem e a TRATATIVA.
 *
 * O saldo aqui é sempre uma DECLARAÇÃO de alguém, nunca uma dedução. Não há
 * PDV integrado, e inventar uma baixa por venda produziria um número exato e
 * falso — pior que um número aproximado e assumido. Por isso cada mudança de
 * saldo vira `StockMovement` com autor e hora: o que não foi declarado não
 * aconteceu para o SGO, e o histórico mostra quem disse o quê.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };
type Falha = { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NAO_ENCONTRADO' | 'SEM_VALIDADE' | 'ENCERRADO' | 'JA_LANCADO' | 'DESTINO_INVALIDO' | 'SALDO_INSUFICIENTE'; message?: string };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

async function diaDaUnidade(unitId: string): Promise<string> {
  const u = await prisma.unit.findUnique({ where: { id: unitId }, select: { timezone: true, cutoffHour: true } });
  return currentOperationalDate({ timezone: u?.timezone ?? 'America/Sao_Paulo', cutoffHour: u?.cutoffHour ?? 4 });
}

/* ───────────────────────── ENTRADA ───────────────────────── */

export interface EntradaInput {
  unitId: string;
  productId: string;
  /** Na embalagem que o gerente contou: 5 (fardos). A conversão é do sistema. */
  quantidade: number;
  lotCode?: string | null;
  expiresAt?: string | null;
  note?: string | null;
  /**
   * O item do pedido da Fábrica/CD que está virando estoque (v1.117.0). Com
   * ele, a entrada marca o item como lançado — e recusa lançar de novo.
   */
  requestItemId?: string | null;
}
export type EntradaResult = { ok: true; lotId: string; unidades: number } | Falha;

/** Sentinela da transação: o item já tinha sido lançado entre a checagem e a gravação. */
class JaLancado extends Error {}

/**
 * Confere o item do pedido ANTES de gravar: é desta unidade, é deste produto,
 * o pedido já foi recebido e ninguém o lançou ainda. Cada recusa diz o motivo,
 * porque as quatro têm consertos diferentes.
 */
async function conferirItemDoPedido(requestItemId: string, unitId: string, productId: string): Promise<Falha | null> {
  const item = await prisma.productRequestItem.findUnique({
    where: { id: requestItemId },
    select: { productId: true, stockedAt: true, request: { select: { unitId: true, status: true } } },
  });
  if (!item) return { ok: false, reason: 'NAO_ENCONTRADO', message: 'Item do pedido não encontrado.' };
  if (item.request.unitId !== unitId) return { ok: false, reason: 'INVALID', message: 'Este item é de um pedido de outra unidade.' };
  if (item.productId !== productId) return { ok: false, reason: 'INVALID', message: 'O item do pedido é de outro produto.' };
  if (!item.request.status.startsWith('CONCLUIDO')) return { ok: false, reason: 'INVALID', message: 'O pedido ainda não foi recebido pela unidade.' };
  if (item.stockedAt) return { ok: false, reason: 'JA_LANCADO', message: 'Este item do pedido já foi lançado no estoque.' };
  return null;
}

/**
 * Lançar o que entrou na prateleira.
 *
 * Produto que controla validade SEM data seria um lote que nunca alerta — o
 * módulo inteiro existe para isso, então aqui é recusa e não aviso. O
 * contrário (data em produto que não controla) é aceito: informação a mais não
 * atrapalha, e o alerta respeita o cadastro.
 */
export async function lancarEntrada(user: SessionUser, input: EntradaInput, ctx: Ctx = {}): Promise<EntradaResult> {
  try { assertUnitAccess(user, input.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  const produto = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true, name: true, packType: true, packSize: true, trackExpiry: true, active: true },
  });
  if (!produto || !produto.active) return { ok: false, reason: 'NAO_ENCONTRADO' };

  const qtd = Number(input.quantidade);
  if (!Number.isFinite(qtd) || qtd <= 0) return { ok: false, reason: 'INVALID', message: 'Informe a quantidade encontrada.' };

  const expiresAt = input.expiresAt && DATA.test(input.expiresAt) ? input.expiresAt : null;
  if (produto.trackExpiry && !expiresAt) {
    return { ok: false, reason: 'SEM_VALIDADE', message: `"${produto.name}" controla validade — informe a data do lote.` };
  }

  const packType = produto.packType as PackType;
  const unitsPerPack = packType === 'UN' ? 1 : Math.max(1, produto.packSize ?? 1);
  const unidades = emUnidades(qtd, packType as TipoDeEmbalagem, unitsPerPack);
  if (unidades <= 0) return { ok: false, reason: 'INVALID', message: 'Informe a quantidade encontrada.' };

  const lotCode = input.lotCode?.trim() || null;

  const requestItemId = input.requestItemId?.trim() || null;
  if (requestItemId) {
    const recusa = await conferirItemDoPedido(requestItemId, input.unitId, produto.id);
    if (recusa) return recusa;
  }

  /* MESMO LOTE = mesma unidade + produto + código + validade. Duas entregas do
     mesmo lote SOMAM em vez de criar duas linhas: na prateleira é uma pilha só,
     e duas linhas fariam o gerente responder a mesma pergunta duas vezes. */
  const existente = await prisma.stockLot.findFirst({
    where: { unitId: input.unitId, productId: produto.id, lotCode, expiresAt, status: 'OPEN' },
    select: { id: true, unitId: true, qtyOnHand: true, qtyReceived: true },
  });

  /* A marcação do item do pedido vai na MESMA transação da entrada, e é
     condicional (stockedAt ainda nulo): dois toques no mesmo botão não podem
     virar dois lotes — o segundo cai na sentinela e a entrada dele é desfeita. */
  async function marcarItem(tx: Tx, lotId: string) {
    if (!requestItemId) return;
    const r = await tx.productRequestItem.updateMany({ where: { id: requestItemId, stockedAt: null }, data: { stockLotId: lotId, stockedAt: new Date() } });
    if (r.count === 0) throw new JaLancado();
  }

  let lotId: string;
  try {
    lotId = await prisma.$transaction(async (tx) => {
      if (existente) {
        const saldo = Math.round((Number(existente.qtyOnHand) + unidades) * 1000) / 1000;
        await mover(tx, existente, 'ENTRY', saldo, user, input.note);
        await tx.stockLot.update({
          where: { id: existente.id },
          data: { qtyOnHand: saldo, qtyReceived: Math.round((Number(existente.qtyReceived) + unidades) * 1000) / 1000 },
        });
        await marcarItem(tx, existente.id);
        return existente.id;
      }
      const novo = await tx.stockLot.create({
        data: {
          unitId: input.unitId, productId: produto.id, lotCode, expiresAt,
          qtyReceived: unidades, qtyOnHand: unidades,
          packType, unitsPerPack,
          createdById: user.id, createdByName: user.name,
        },
        select: { id: true, unitId: true, qtyOnHand: true },
      });
      await mover(tx, { ...novo, qtyOnHand: 0 }, 'ENTRY', unidades, user, input.note);
      await marcarItem(tx, novo.id);
      return novo.id;
    });
  } catch (e) {
    if (e instanceof JaLancado) return { ok: false, reason: 'JA_LANCADO', message: 'Este item do pedido já foi lançado no estoque.' };
    throw e;
  }

  await audit({
    userId: user.id, unitId: input.unitId, action: 'STOCK_ENTRY', module: 'STOCK', entity: 'stock_lot', entityId: lotId,
    metadata: { produto: produto.name, unidades, lote: lotCode, validade: expiresAt, itemDoPedido: requestItemId }, ...ctx,
  });
  return { ok: true, lotId, unidades };
}

/* ───────────────────────── CONTAGEM ───────────────────────── */

export type ContagemResult = { ok: true; unidades: number } | Falha;

/**
 * Contagem: o saldo passa a ser o que a pessoa contou.
 *
 * Substitui, não soma. É o que o gerente faz andando pelo estoque com o
 * celular — e a diferença contra o saldo anterior fica gravada no movimento,
 * que é de onde sai a "divergência de conferência" do painel.
 */
export async function registrarContagem(user: SessionUser, lotId: string, quantidade: number, note?: string | null, ctx: Ctx = {}): Promise<ContagemResult> {
  const lote = await prisma.stockLot.findUnique({
    where: { id: lotId },
    select: { id: true, unitId: true, qtyOnHand: true, status: true, packType: true, unitsPerPack: true, product: { select: { name: true } } },
  });
  if (!lote) return { ok: false, reason: 'NAO_ENCONTRADO' };
  try { assertUnitAccess(user, lote.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  if (lote.status !== 'OPEN') return { ok: false, reason: 'ENCERRADO', message: 'Este lote já foi encerrado.' };

  const qtd = Number(quantidade);
  /* Zero é válido e significa "acabou" — diferente de não informar. */
  if (!Number.isFinite(qtd) || qtd < 0) return { ok: false, reason: 'INVALID', message: 'Informe a quantidade contada.' };

  const unidades = emUnidades(qtd, lote.packType as TipoDeEmbalagem, lote.unitsPerPack);
  await prisma.$transaction(async (tx) => {
    await mover(tx, lote, 'COUNT', unidades, user, note);
    await tx.stockLot.update({ where: { id: lote.id }, data: { qtyOnHand: unidades } });
  });
  await audit({
    userId: user.id, unitId: lote.unitId, action: 'STOCK_COUNT', module: 'STOCK', entity: 'stock_lot', entityId: lote.id,
    metadata: { produto: lote.product.name, de: Number(lote.qtyOnHand), para: unidades }, ...ctx,
  });
  return { ok: true, unidades };
}

/* ───────────────────────── TRATATIVA ───────────────────────── */

/** As quatro respostas possíveis à pergunta do alerta de validade. */
export type Tratativa = 'FINALIZADO' | 'AINDA_TEM' | 'DESCARTE' | 'TRANSFERIDO';

export type TratativaResult = { ok: true; status: string; saldo: number } | Falha;

/**
 * A resposta do gerente ao alerta — o que substitui o PDV que não existe.
 *
 * Sem isto, ou o SGO exigiria baixa diária de saída (o gerente vira digitador e
 * o dado morre na primeira semana), ou o alerta repetiria a mesma pergunta para
 * sempre sobre um lote que acabou há um mês.
 *
 * `AINDA_TEM` é a única que mantém o lote vivo, e por isso é a única que pede
 * quantidade. As outras três encerram o monitoramento com um motivo diferente,
 * e a diferença importa: "acabou" é normal, "descarte" é perda a somar, e
 * "transferido" é mercadoria que está noutra unidade.
 */
export async function tratarLote(
  user: SessionUser,
  lotId: string,
  tratativa: Tratativa,
  input: { quantidade?: number; note?: string | null; paraUnitId?: string | null } = {},
  ctx: Ctx = {},
): Promise<TratativaResult> {
  const lote = await prisma.stockLot.findUnique({
    where: { id: lotId },
    select: {
      id: true, unitId: true, qtyOnHand: true, status: true, expiresAt: true, lastReviewBand: true,
      packType: true, unitsPerPack: true, product: { select: { name: true, alertDays: true } },
    },
  });
  if (!lote) return { ok: false, reason: 'NAO_ENCONTRADO' };
  try { assertUnitAccess(user, lote.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  if (lote.status !== 'OPEN') return { ok: false, reason: 'ENCERRADO', message: 'Este lote já foi encerrado.' };

  const hoje = await diaDaUnidade(lote.unitId);
  /* A faixa de HOJE é o que fica gravado como "já perguntamos isto". Gravar a
     faixa de ontem faria a pergunta voltar amanhã sem nada ter mudado. */
  const banda = bandaDaFaixa(faixaDaValidade(lote.expiresAt, hoje, lote.product.alertDays));

  /* "Transferido" deixou de ser só um motivo de encerramento (v1.117.0): a
     mercadoria ENTRA na outra unidade, no mesmo lote e com a mesma validade.
     Sem o destino, o lote sumiria daqui e não apareceria em lugar nenhum. */
  if (tratativa === 'TRANSFERIDO') {
    if (!input.paraUnitId) return { ok: false, reason: 'INVALID', message: 'Informe para qual unidade o lote foi transferido.' };
    const t = await transferirLote(user, { lotId: lote.id, paraUnitId: input.paraUnitId, quantidade: null, note: input.note }, ctx);
    if (!t.ok) return t;
    await prisma.stockLot.update({ where: { id: lote.id }, data: { lastReviewBand: banda, lastReviewAt: new Date() } });
    await audit({
      userId: user.id, unitId: lote.unitId, action: 'STOCK_LOT_REVIEW', module: 'STOCK', entity: 'stock_lot', entityId: lote.id,
      metadata: { produto: lote.product.name, tratativa, saldoAntes: Number(lote.qtyOnHand), saldoDepois: 0, faixa: banda, paraUnitId: input.paraUnitId }, ...ctx,
    });
    return { ok: true, status: 'TRANSFERRED', saldo: 0 };
  }

  let saldo = 0;
  let status: 'OPEN' | 'FINISHED' | 'DISCARDED' | 'TRANSFERRED' = 'FINISHED';
  let tipo: StockMoveType = 'FINISH';

  if (tratativa === 'AINDA_TEM') {
    const qtd = Number(input.quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      return { ok: false, reason: 'INVALID', message: 'Informe quanto ainda existe deste lote.' };
    }
    saldo = emUnidades(qtd, lote.packType as TipoDeEmbalagem, lote.unitsPerPack);
    status = 'OPEN';
    tipo = 'COUNT';
  } else if (tratativa === 'DESCARTE') {
    status = 'DISCARDED';
    tipo = 'DISCARD';
  }

  await prisma.$transaction(async (tx) => {
    await mover(tx, lote, tipo, saldo, user, input.note);
    await tx.stockLot.update({
      where: { id: lote.id },
      data: {
        qtyOnHand: saldo,
        status,
        lastReviewBand: banda,
        lastReviewAt: new Date(),
        ...(status === 'OPEN' ? {} : { closedAt: new Date(), closedByName: user.name, closeNote: input.note?.trim() || null }),
      },
    });
  });

  await audit({
    userId: user.id, unitId: lote.unitId, action: 'STOCK_LOT_REVIEW', module: 'STOCK', entity: 'stock_lot', entityId: lote.id,
    metadata: { produto: lote.product.name, tratativa, saldoAntes: Number(lote.qtyOnHand), saldoDepois: saldo, faixa: banda }, ...ctx,
  });
  return { ok: true, status, saldo };
}
