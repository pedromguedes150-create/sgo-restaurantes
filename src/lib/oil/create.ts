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
}
export type CreateOilResult = { ok: true; id: string; totalValue: number } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' };

type Ctx = { ip?: string | null; userAgent?: string | null };

/** Registra uma coleta de óleo usado (recebemos por ela). */
export async function createOilCollection(user: SessionUser, input: CreateOilInput, ctx: Ctx = {}): Promise<CreateOilResult> {
  try { assertUnitAccess(user, input.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  const liters = Number(input.liters);
  const price = Number(input.pricePerLiter);
  if (!(liters > 0) || !(price >= 0)) return { ok: false, reason: 'INVALID' };
  const total = input.totalValue != null && input.totalValue > 0 ? Number(input.totalValue) : Math.round(liters * price * 100) / 100;

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { timezone: true, cutoffHour: true } });
  if (!unit) return { ok: false, reason: 'INVALID' };
  const opDate = input.operationalDate && /^\d{4}-\d{2}-\d{2}$/.test(input.operationalDate)
    ? input.operationalDate
    : currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });

  const rec = await prisma.oilCollection.create({
    data: {
      unitId: input.unitId,
      supplierId: input.supplierId || null,
      operationalDate: opDate,
      liters,
      pricePerLiter: price,
      totalValue: total,
      paymentMethod: input.paymentMethod?.trim() || null,
      collectorName: input.collectorName?.trim() || null,
      observation: input.observation?.trim() || null,
      createdById: user.id,
    },
    select: { id: true },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'OIL_COLLECTION', module: 'OIL', entity: 'oil_collection', entityId: rec.id, metadata: { liters, price, total }, ...ctx });
  return { ok: true, id: rec.id, totalValue: total };
}
