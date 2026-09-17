import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { currentOperationalDate } from '@/lib/date/operational';
import type { SessionUser } from '@/lib/auth/session';

export interface CreateOilInput {
  unitId: string;
  supplierId?: string;
  liters: number;
  pricePerLiter: number;
  totalValue?: number;
  paymentMethod?: string;
  collectorName?: string;
  observation?: string;
  operationalDate?: string;
  /** Caminho da foto do recibo já salva no volume de uploads. */
  receiptPath?: string;
}
export type CreateOilReason = 'FORBIDDEN' | 'INVALID' | 'SEM_COMPROVANTE' | 'SEM_COLETOR' | 'DATA_FUTURA';
export type CreateOilResult = { ok: true; id: string; totalValue: number } | { ok: false; reason: CreateOilReason };

type Ctx = { ip?: string | null; userAgent?: string | null };

/**
 * Registra uma coleta de óleo usado (recebemos por ela).
 *
 * O lançamento não fecha sem a FOTO DO RECIBO e sem dizer quem coletou. A
 * coleta é a única movimentação do sistema em que sai mercadoria e entra
 * dinheiro por fora do caixa: sem o papel ao lado do número, "80 litros no
 * recibo, 100 no sistema" é indistinguível de um erro de digitação. O
 * comprovante e o `createdById` são o que transformam a divergência em algo
 * que se aponta para uma pessoa e uma hora.
 */
export async function createOilCollection(user: SessionUser, input: CreateOilInput, ctx: Ctx = {}): Promise<CreateOilResult> {
  try { assertUnitAccess(user, input.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  const liters = Number(input.liters);
  const price = Number(input.pricePerLiter);
  if (!(liters > 0) || !(price >= 0)) return { ok: false, reason: 'INVALID' };

  /* Sem comprovante não há o que conferir — e a conferência é a razão desta
     tela existir. A checagem mora AQUI, não só no formulário: a rota é a
     porta, a tela é só a fachada. */
  const receiptPath = input.receiptPath?.trim();
  if (!receiptPath) return { ok: false, reason: 'SEM_COMPROVANTE' };

  /* Empresa/responsável pela coleta: ou é um fornecedor cadastrado, ou é um
     nome digitado. Aceitar "nenhum dos dois" deixava a coleta sem contraparte —
     não dá para cobrar de ninguém um óleo que saiu da unidade. */
  const collectorName = input.collectorName?.trim() || null;
  if (!input.supplierId && !collectorName) return { ok: false, reason: 'SEM_COLETOR' };

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { timezone: true, cutoffHour: true } });
  if (!unit) return { ok: false, reason: 'INVALID' };
  const hoje = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  const opDate = input.operationalDate && /^\d{4}-\d{2}-\d{2}$/.test(input.operationalDate) ? input.operationalDate : hoje;
  /* Coleta que ainda não aconteceu não tem recibo — se a data é futura, o
     comprovante anexado é de outra coisa. */
  if (opDate > hoje) return { ok: false, reason: 'DATA_FUTURA' };

  const total = input.totalValue != null && input.totalValue > 0 ? Number(input.totalValue) : Math.round(liters * price * 100) / 100;

  const rec = await prisma.oilCollection.create({
    data: {
      unitId: input.unitId,
      supplierId: input.supplierId || null,
      operationalDate: opDate,
      liters,
      pricePerLiter: price,
      totalValue: total,
      paymentMethod: input.paymentMethod?.trim() || null,
      collectorName,
      observation: input.observation?.trim() || null,
      receiptPath,
      /* Responsável pelo lançamento: sempre a sessão, nunca o corpo do
         request. O campo é a rastreabilidade — deixá-lo chegar de fora seria
         permitir lançar em nome de outra pessoa. */
      createdById: user.id,
    },
    select: { id: true },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'OIL_COLLECTION', module: 'OIL', entity: 'oil_collection', entityId: rec.id, metadata: { liters, price, total, data: opDate, comprovante: true }, ...ctx });
  return { ok: true, id: rec.id, totalValue: total };
}
