import type { prisma } from '@/lib/db/prisma';
import type { StockMoveType } from '@prisma/client';
import type { SessionUser } from '@/lib/auth/session';

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Grava o movimento junto com o saldo, sempre na MESMA transação de quem
 * altera o lote. Todo movimento é uma declaração de alguém, com autor e hora;
 * `qty` é a variação (negativa numa saída) e `qtyAfter` o saldo que ficou.
 */
export async function registrarMovimento(
  tx: Tx,
  lote: { id: string; unitId: string; qtyOnHand: unknown },
  type: StockMoveType,
  novoSaldo: number,
  user: SessionUser,
  note?: string | null,
  contraparte?: { unitId: string; lotId: string },
) {
  const antes = Number(lote.qtyOnHand);
  await tx.stockMovement.create({
    data: {
      lotId: lote.id, unitId: lote.unitId, type,
      qty: Math.round((novoSaldo - antes) * 1000) / 1000,
      qtyAfter: novoSaldo,
      note: note?.trim() || null,
      counterpartUnitId: contraparte?.unitId ?? null,
      counterpartLotId: contraparte?.lotId ?? null,
      createdById: user.id, createdByName: user.name,
    },
  });
}
