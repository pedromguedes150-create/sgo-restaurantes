import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUnitRole, notifyRole } from '@/lib/notifications';
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
  workStartTime?: string;
  workEndTime?: string;
  // overtime
  collaboratorName?: string;
  reason?: string;
  // misc
  miscTypeId?: string;
  beneficiary?: string;
  attachmentPath?: string;
  supplierId?: string;
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

  // Divergência de valor (freelancer): compara o valor lançado com o padrão cadastrado.
  // Não bloqueia — apenas sinaliza e alerta gerente/aprovadores.
  let standardValue: number | null = null;
  let divergent = false;
  if (input.type === 'FREELANCER' && input.freelancerId) {
    const fr = await prisma.freelancer.findUnique({ where: { id: input.freelancerId }, select: { defaultValue: true } });
    if (fr) { standardValue = Number(fr.defaultValue); divergent = Math.abs(standardValue - input.amount) > 0.001; }
  }

  const req = await prisma.paymentRequest.create({
    data: {
      type: input.type,
      unitId: input.unitId,
      requestedById: user.id,
      approverRole,
      amount: input.amount,
      standardValue,
      divergent,
      description: input.description?.trim() || null,
      freelancerId: input.freelancerId || null,
      workDate: input.workDate ? new Date(input.workDate) : null,
      shift: input.shift || null,
      hours: input.hours ?? null,
      workStartTime: input.type === 'FREELANCER' ? (input.workStartTime?.trim() || null) : null,
      workEndTime: input.type === 'FREELANCER' ? (input.workEndTime?.trim() || null) : null,
      collaboratorName: input.collaboratorName?.trim() || null,
      reason: input.reason?.trim() || null,
      miscTypeId: input.miscTypeId || null,
      beneficiary: input.beneficiary?.trim() || null,
      attachmentPath: input.attachmentPath || null,
      supplierId: input.supplierId || null,
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

  // Notifica os aprovadores: por unidade quando o papel é vinculado (SUPERVISOR/
  // COORDINATOR/MANAGER), globalmente para ADMIN/CEO/FINANCE.
  const TYPE_LABEL: Record<string, string> = { FREELANCER: 'Freelancer', OVERTIME: 'Hora Extra', MISC: 'Pagamento avulso' };
  const divNote = divergent && standardValue !== null
    ? ` ⚠ DIVERGÊNCIA: valor padrão é R$ ${standardValue.toFixed(2)}.`
    : '';
  const payload = {
    title: divergent ? '⚠ Pagamento com divergência de valor' : 'Pagamento aguardando aprovação',
    body: `${TYPE_LABEL[input.type] ?? input.type} de R$ ${input.amount.toFixed(2)} solicitado por ${user.name}.${divNote}`,
    link: '/modulos/pagamentos',
    module: 'PAYMENTS',
  };
  if (approverRole === 'ADMIN' || approverRole === 'CEO' || approverRole === 'FINANCE') {
    await notifyRole(approverRole, payload);
  } else {
    await notifyUnitRole(input.unitId, approverRole, payload);
  }
  return { ok: true, id: req.id };
}
