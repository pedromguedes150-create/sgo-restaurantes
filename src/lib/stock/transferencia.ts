import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { notifyUnitRole } from '@/lib/notifications';
import { descreverQuantidade, emUnidades, type TipoDeEmbalagem } from '@/lib/stock/embalagem';
import { registrarMovimento } from '@/lib/stock/movimento';
import type { SessionUser } from '@/lib/auth/session';

/**
 * TRANSFERÊNCIA ENTRE UNIDADES (etapa 2 do Estoque).
 *
 * A mercadoria sai de uma prateleira e entra em outra — e as DUAS têm de
 * registrar, senão o lote some da origem e aparece no destino como se tivesse
 * nascido lá. Por isso a transferência é uma transação só com dois movimentos
 * casados (`TRANSFER_OUT` na origem, `TRANSFER_IN` no destino), cada um
 * apontando para o lote do outro lado.
 *
 * O destino herda o LOTE, não só o produto: o mesmo código e a mesma validade,
 * com a embalagem congelada da origem. É a mesma pilha em outra prateleira, e
 * o alerta de validade tem de continuar contando do mesmo dia. Se lá já existe
 * a mesma pilha (mesmo produto, código e validade, em uso), soma — regra
 * idêntica à da entrada.
 *
 * Quem transfere precisa de acesso à ORIGEM, e só a ela: o gerente de uma
 * unidade não é gerente da unidade irmã, mas é ele quem põe a mercadoria no
 * carro. O destino é avisado.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };

export type TransferenciaResult =
  | { ok: true; destinoLotId: string; unidades: number; origemEncerrada: boolean }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NAO_ENCONTRADO' | 'ENCERRADO' | 'DESTINO_INVALIDO' | 'SALDO_INSUFICIENTE'; message?: string };

export interface TransferenciaInput {
  lotId: string;
  paraUnitId: string;
  /** Na embalagem do lote (5 fardos). Vazio = o lote inteiro. */
  quantidade?: number | null;
  note?: string | null;
}

export async function transferirLote(user: SessionUser, input: TransferenciaInput, ctx: Ctx = {}): Promise<TransferenciaResult> {
  const lote = await prisma.stockLot.findUnique({
    where: { id: input.lotId },
    select: {
      id: true, unitId: true, productId: true, lotCode: true, expiresAt: true,
      qtyOnHand: true, status: true, packType: true, unitsPerPack: true,
      product: { select: { name: true, active: true } },
      unit: { select: { name: true } },
    },
  });
  if (!lote) return { ok: false, reason: 'NAO_ENCONTRADO' };
  try { assertUnitAccess(user, lote.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  if (lote.status !== 'OPEN') return { ok: false, reason: 'ENCERRADO', message: 'Este lote já foi encerrado.' };

  if (!input.paraUnitId || input.paraUnitId === lote.unitId) {
    return { ok: false, reason: 'DESTINO_INVALIDO', message: 'Escolha a unidade que vai receber — diferente desta.' };
  }
  const destino = await prisma.unit.findUnique({ where: { id: input.paraUnitId }, select: { id: true, name: true, active: true } });
  if (!destino || !destino.active) return { ok: false, reason: 'DESTINO_INVALIDO', message: 'Unidade de destino não encontrada.' };

  const saldo = Number(lote.qtyOnHand);
  const tipo = lote.packType as TipoDeEmbalagem;
  const unidades = input.quantidade == null
    ? saldo
    : emUnidades(Number(input.quantidade), tipo, lote.unitsPerPack);
  if (!Number.isFinite(unidades) || unidades <= 0) return { ok: false, reason: 'INVALID', message: 'Informe quanto está sendo transferido.' };
  /* Tolerância de milésimo: o saldo é Decimal(12,3) e a conversão arredonda. */
  if (unidades > saldo + 0.0005) {
    return {
      ok: false, reason: 'SALDO_INSUFICIENTE',
      message: `O lote tem ${descreverQuantidade(saldo, tipo, lote.unitsPerPack)} — não dá para transferir ${descreverQuantidade(unidades, tipo, lote.unitsPerPack)}.`,
    };
  }
  const novoSaldoOrigem = Math.max(0, Math.round((saldo - unidades) * 1000) / 1000);
  const encerra = novoSaldoOrigem === 0;
  const nota = input.note?.trim() || null;

  const destinoLotId = await prisma.$transaction(async (tx) => {
    const existente = await tx.stockLot.findFirst({
      where: { unitId: destino.id, productId: lote.productId, lotCode: lote.lotCode, expiresAt: lote.expiresAt, status: 'OPEN' },
      select: { id: true, unitId: true, qtyOnHand: true, qtyReceived: true },
    });
    let destinoId: string;
    if (existente) {
      const novo = Math.round((Number(existente.qtyOnHand) + unidades) * 1000) / 1000;
      await registrarMovimento(tx, existente, 'TRANSFER_IN', novo, user, nota, { unitId: lote.unitId, lotId: lote.id });
      await tx.stockLot.update({
        where: { id: existente.id },
        data: { qtyOnHand: novo, qtyReceived: Math.round((Number(existente.qtyReceived) + unidades) * 1000) / 1000 },
      });
      destinoId = existente.id;
    } else {
      const criado = await tx.stockLot.create({
        data: {
          unitId: destino.id, productId: lote.productId, lotCode: lote.lotCode, expiresAt: lote.expiresAt,
          qtyReceived: unidades, qtyOnHand: unidades,
          packType: lote.packType, unitsPerPack: lote.unitsPerPack,
          createdById: user.id, createdByName: user.name,
        },
        select: { id: true, unitId: true },
      });
      await registrarMovimento(tx, { ...criado, qtyOnHand: 0 }, 'TRANSFER_IN', unidades, user, nota, { unitId: lote.unitId, lotId: lote.id });
      destinoId = criado.id;
    }

    await registrarMovimento(tx, lote, 'TRANSFER_OUT', novoSaldoOrigem, user, nota, { unitId: destino.id, lotId: destinoId });
    await tx.stockLot.update({
      where: { id: lote.id },
      data: {
        qtyOnHand: novoSaldoOrigem,
        ...(encerra ? { status: 'TRANSFERRED', closedAt: new Date(), closedByName: user.name, closeNote: nota ?? `Transferido para ${destino.name}` } : {}),
      },
    });
    return destinoId;
  });

  const quantidade = descreverQuantidade(unidades, tipo, lote.unitsPerPack);
  await notifyUnitRole(destino.id, 'MANAGER', {
    title: '📦 Estoque recebido de outra unidade',
    body: `${lote.unit.name} transferiu ${quantidade} de ${lote.product.name}${lote.expiresAt ? ` (validade ${lote.expiresAt.split('-').reverse().join('/')})` : ''}. Já está no seu estoque.`,
    link: '/modulos/estoque', module: 'STOCK',
  }).catch(() => {});

  await audit({
    userId: user.id, unitId: lote.unitId, action: 'STOCK_TRANSFER', module: 'STOCK', entity: 'stock_lot', entityId: lote.id,
    metadata: {
      produto: lote.product.name, unidades, lote: lote.lotCode, validade: lote.expiresAt,
      de: lote.unit.name, para: destino.name, paraUnitId: destino.id, destinoLotId, origemEncerrada: encerra, nota,
    }, ...ctx,
  });

  return { ok: true, destinoLotId, unidades, origemEncerrada: encerra };
}
