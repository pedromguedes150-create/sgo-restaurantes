import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { PaymentType, Role } from '@prisma/client';

export interface CreatePaymentInput {
  type: PaymentType;
  unitId: string;
  amount: number;
  description?: string;
  // freelancer
  freelancerId?: string;
  workDate?: string;
  shift?: string;
  hours?: number;
  // overtime
  collaboratorName?: string;
  reason?: string;
  // misc
  miscTypeId?: string;
  beneficiary?: string;
  attachmentPath?: string;
}

export type CreatePaymentResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' };

/** Cria uma solicitação de pagamento e roteia ao aprovador correto (Módulo 7). */
export async function createPaymentRequest(
  user: SessionUser,
  input: CreatePaymentInput,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<CreatePaymentResult> {
  try {
    assertUnitAccess(user, input.unitId);
  } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  if (!input.amount || input.amount <= 0) return { ok: false, reason: 'INVALID' };

  // Aprovador: SUPERVISOR para freela/HE; do tipo para avulso
  let approverRole: Role = 'SUPERVISOR';
  if (input.type === 'MISC') {
    if (!input.miscTypeId) return { ok: false, reason: 'INVALID' };
    const t = await prisma.miscPaymentType.findUnique({ where: { id: input.miscTypeId } });
    if (!t) return { ok: false, reason: 'INVALID' };
    approverRole = t.approverRole;
  }
  if (input.type === 'FREELANCER' && !input.freelancerId) return { ok: false, reason: 'INVALID' };

  const req = await prisma.paymentRequest.create({
    data: {
      type: input.type,
      unitId: input.unitId,
      requestedById: user.id,
      approverRole,
      amount: input.amount,
      description: input.description?.trim() || null,
      freelancerId: input.freelancerId || null,
      workDate: input.workDate ? new Date(input.workDate) : null,
      shift: input.shift || null,
      hours: input.hours ?? null,
      collaboratorName: input.collaboratorName?.trim() || null,
      reason: input.reason?.trim() || null,
      miscTypeId: input.miscTypeId || null,
      beneficiary: input.beneficiary?.trim() || null,
      attachmentPath: input.attachmentPath || null,
    },
    select: { id: true },
  });

  await audit({
    userId: user.id,
    unitId: input.unitId,
    action: 'PAYMENT_REQUEST',
    module: 'PAYMENTS',
    entity: 'payment_request',
    entityId: req.id,
    metadata: { type: input.type, amount: input.amount, approverRole },
    ...ctx,
  });
  return { ok: true, id: req.id };
}
