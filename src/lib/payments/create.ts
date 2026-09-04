import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUnitRole, notifyRole } from '@/lib/notifications';
import { avaliarRecorrencia, avisarRecorrencia, type Recorrencia } from '@/lib/payments/recorrencia';
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
  /// Setor/função para o qual o freelancer foi contratado (obrigatório, 04/09):
  /// já nasce alocado no Mapa do dia, sem passar pelo painel "Freelancers do dia".
  workSectorId?: string;
  transportValue?: number;
  /// Cobertura temporária de setor (16/07): valor por DIA do setor cadastrado
  coverageSector?: string;
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
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID'; detail?: string };

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
  // Aprovador: SUPERVISOR para freela/HE; do tipo para avulso
  let approverRole: Role = 'SUPERVISOR';
  if (input.type === 'MISC') {
    if (!input.miscTypeId) return { ok: false, reason: 'INVALID' };
    const t = await prisma.miscPaymentType.findUnique({ where: { id: input.miscTypeId } });
    if (!t) return { ok: false, reason: 'INVALID' };
    approverRole = t.approverRole;
  }
  if (input.type === 'FREELANCER' && !input.freelancerId) return { ok: false, reason: 'INVALID', detail: 'Escolha o freelancer.' };
  // Freelancer sem dia e sem setor não aparece em mapa nenhum — e "alocar depois"
  // era o que ficava esquecido. Pedido de 04/09: os dois são obrigatórios.
  let workSectorId: string | null = null;
  let recorrencia: Recorrencia | null = null;
  if (input.type === 'FREELANCER') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate ?? '')) return { ok: false, reason: 'INVALID', detail: 'Informe o dia do trabalho.' };
    if (!input.workSectorId) return { ok: false, reason: 'INVALID', detail: 'Escolha o setor/função do freelancer.' };
    const sector = await prisma.sector.findUnique({ where: { id: input.workSectorId }, select: { unitId: true, active: true } });
    if (!sector || sector.unitId !== input.unitId || !sector.active) return { ok: false, reason: 'INVALID', detail: 'Setor não pertence a esta unidade.' };
    workSectorId = input.workSectorId;
    // Mesmo freelancer mais de N vezes na semana do dia de trabalho → marca e avisa.
    recorrencia = await avaliarRecorrencia(input.freelancerId!, input.workDate!);
  }

  // Freelancer: se houver valor/hora cadastrado p/ a unidade+tipo de dia, o valor
  // sai AUTOMÁTICO (horas × valor/hora + vale transporte). Senão, usa o valor
  // digitado (modo manual/temporário) e mantém a divergência vs valor padrão.
  let effectiveAmount = input.amount;
  let effectiveHours = input.hours ?? null;
  // VT: freelancer E hora extra (16/07) somam o vale-transporte ao total
  const transportValue = (input.type === 'FREELANCER' || input.type === 'OVERTIME') && input.transportValue && input.transportValue > 0 ? Number(input.transportValue) : null;
  let standardValue: number | null = null;
  let divergent = false;
  let autoPriced = false;
  const coverageSector = input.type === 'FREELANCER' ? (input.coverageSector?.trim() || null) : null;
  if (input.type === 'FREELANCER' && coverageSector) {
    // Cobertura de setor: valor fechado por DIA do cadastro do freelancer + VT
    const rate = await prisma.freelancerSectorRate.findUnique({
      where: { freelancerId_sectorName: { freelancerId: input.freelancerId!, sectorName: coverageSector } },
    });
    if (!rate) return { ok: false, reason: 'INVALID' };
    effectiveAmount = Number(rate.dayValue) + (transportValue ?? 0);
    effectiveHours = null;
    standardValue = Number(rate.dayValue);
    autoPriced = true;
  } else if (input.type === 'FREELANCER') {
    if (input.workDate && input.workStartTime && input.workEndTime) {
      const { computeFreelancerAmount } = await import('@/lib/freelancer/pricing');
      const calc = await computeFreelancerAmount({ unitId: input.unitId, dateISO: input.workDate, start: input.workStartTime, end: input.workEndTime, transport: transportValue ?? 0 });
      if (calc.configured) { effectiveAmount = calc.amount; effectiveHours = calc.hours; autoPriced = true; }
    }
    if (!autoPriced && input.freelancerId) {
      const fr = await prisma.freelancer.findUnique({ where: { id: input.freelancerId }, select: { defaultValue: true } });
      if (fr) { standardValue = Number(fr.defaultValue); divergent = Math.abs(standardValue - effectiveAmount) > 0.001; }
    }
  } else if (input.type === 'OVERTIME' && transportValue) {
    effectiveAmount = input.amount + transportValue;
  }
  if (!effectiveAmount || effectiveAmount <= 0) return { ok: false, reason: 'INVALID', detail: 'Informe o valor.' };

  const req = await prisma.paymentRequest.create({
    data: {
      type: input.type,
      unitId: input.unitId,
      requestedById: user.id,
      approverRole,
      amount: effectiveAmount,
      standardValue,
      divergent,
      weekCount: recorrencia?.weekCount ?? null,
      recurrent: recorrencia?.recurrent ?? false,
      description: input.description?.trim() || null,
      freelancerId: input.freelancerId || null,
      workDate: input.workDate ? new Date(input.workDate) : null,
      shift: input.shift || null,
      hours: effectiveHours,
      transportValue,
      workStartTime: input.type === 'FREELANCER' ? (input.workStartTime?.trim() || null) : null,
      workEndTime: input.type === 'FREELANCER' ? (input.workEndTime?.trim() || null) : null,
      workSectorId,
      coverageSector,
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
    metadata: { type: input.type, amount: input.amount, approverRole, ...(recorrencia ? { weekCount: recorrencia.weekCount, recurrent: recorrencia.recurrent } : {}) },
    ...ctx,
  });
  if (recorrencia?.recurrent) await avisarRecorrencia(input.unitId, input.freelancerId!, recorrencia, input.workDate!);

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
