import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyRole, notifyUsers } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { Role } from '@prisma/client';

type Ctx = { ip?: string | null; userAgent?: string | null };
export type PayActionResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' | 'STATE'; detail?: string };

/**
 * Papéis de aprovação que o usuário pode exercer agora — inclui DELEGAÇÃO ativa
 * (substituto por período recebe a capacidade do delegante). Módulo 7.
 */
export async function approverRolesFor(user: SessionUser, now: Date = new Date()): Promise<Set<Role>> {
  const roles = new Set<Role>([user.role]);
  if (user.role === 'ADMIN' || user.role === 'CEO') {
    (['SUPERVISOR', 'ADMIN', 'COORDINATOR', 'MANAGER', 'FINANCE', 'CEO'] as Role[]).forEach((r) => roles.add(r));
  }
  const delegs = await prisma.approvalDelegation.findMany({
    where: { toUserId: user.id, startsAt: { lte: now }, endsAt: { gte: now } },
    include: { fromUser: { select: { role: true } } },
  });
  for (const d of delegs) roles.add(d.fromUser.role);
  return roles;
}

export async function canApprove(user: SessionUser, requestId: string): Promise<boolean> {
  const req = await prisma.paymentRequest.findUnique({ where: { id: requestId }, select: { unitId: true, status: true, approverRole: true } });
  if (!req || req.status !== 'PENDING' || !canAccessUnit(user, req.unitId)) return false;
  const roles = await approverRolesFor(user);
  return roles.has(req.approverRole);
}

/**
 * Aprova VÁRIAS solicitações de uma vez (Onda 4). Reusa approveRequest item a
 * item — cada uma mantém a checagem de permissão, a segregação de funções, a
 * guarda contra dupla aprovação e o registro de auditoria próprios.
 *
 * A diferença está no aviso: aprovar 158 pagamentos não pode virar 158
 * notificações para o Financeiro. Por isso o aviso ao Financeiro é suprimido
 * no laço e mandado UMA vez, consolidado. O solicitante segue avisado
 * individualmente — são pessoas diferentes, cada uma precisa saber da sua.
 */
export async function approveManyRequests(
  user: SessionUser,
  ids: string[],
  ctx: Ctx = {},
): Promise<{ approved: number; failed: { id: string; reason: string }[] }> {
  const unique = [...new Set(ids)].slice(0, MAX_BATCH);
  const failed: { id: string; reason: string }[] = [];
  let approved = 0;
  let total = 0;

  for (const id of unique) {
    const before = await prisma.paymentRequest.findUnique({ where: { id }, select: { amount: true } });
    const r = await approveRequest(user, id, ctx, { skipFinanceNotice: true });
    if (r.ok) { approved += 1; total += Number(before?.amount ?? 0); }
    else failed.push({ id, reason: r.reason });
  }

  if (approved > 0) {
    await notifyRole('FINANCE', {
      title: `${approved} pagamento(s) aprovado(s) — processar`,
      body: `Total de R$ ${total.toFixed(2)} aprovado por ${user.name}.`,
      link: '/modulos/pagamentos',
      module: 'PAYMENTS',
    });
  }
  return { approved, failed };
}

/** Teto por chamada: evita uma requisição gigante segurando o servidor. */
export const MAX_BATCH = 200;

export async function approveRequest(user: SessionUser, id: string, ctx: Ctx = {}, opts: { skipFinanceNotice?: boolean } = {}): Promise<PayActionResult> {
  const req = await prisma.paymentRequest.findUnique({ where: { id }, select: { unitId: true, status: true, approverRole: true, type: true, amount: true, requestedById: true } });
  if (!req) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, req.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (req.status !== 'PENDING') return { ok: false, reason: 'STATE' };
  // Segregação de funções: quem lança não aprova o próprio — EXCETO ADMIN/CEO (decisão do Pedro, 21/07).
  if (req.requestedById === user.id && user.role !== 'ADMIN' && user.role !== 'CEO') return { ok: false, reason: 'FORBIDDEN' };
  const roles = await approverRolesFor(user);
  if (!roles.has(req.approverRole)) return { ok: false, reason: 'FORBIDDEN' };

  const res = await prisma.paymentRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() },
  });
  if (res.count === 0) return { ok: false, reason: 'STATE' };

  await audit({ userId: user.id, unitId: req.unitId, action: 'PAYMENT_APPROVE', module: 'PAYMENTS', entity: 'payment_request', entityId: id, metadata: { type: req.type, notify: ['FINANCE'] }, ...ctx });
  // Aprovado → Financeiro processa; solicitante fica sabendo.
  // Em lote, o aviso ao Financeiro sai uma vez só (ver approveManyRequests).
  if (!opts.skipFinanceNotice) {
    await notifyRole('FINANCE', {
      title: 'Pagamento aprovado — processar',
      body: `Solicitação de R$ ${Number(req.amount).toFixed(2)} aprovada por ${user.name}.`,
      link: '/modulos/pagamentos',
      module: 'PAYMENTS',
    });
  }
  if (req.requestedById) {
    await notifyUsers([req.requestedById], {
      title: 'Sua solicitação foi aprovada',
      body: `Pagamento de R$ ${Number(req.amount).toFixed(2)} aprovado por ${user.name}.`,
      link: '/modulos/pagamentos',
      module: 'PAYMENTS',
    });
  }
  return { ok: true };
}

export async function rejectRequest(user: SessionUser, id: string, reason: string, ctx: Ctx = {}): Promise<PayActionResult> {
  if (!reason?.trim()) return { ok: false, reason: 'INVALID' };
  const req = await prisma.paymentRequest.findUnique({ where: { id }, select: { unitId: true, status: true, approverRole: true } });
  if (!req) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, req.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (req.status !== 'PENDING') return { ok: false, reason: 'STATE' };
  const roles = await approverRolesFor(user);
  if (!roles.has(req.approverRole)) return { ok: false, reason: 'FORBIDDEN' };

  const res = await prisma.paymentRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'REJECTED', approvedById: user.id, approvedAt: new Date(), rejectionReason: reason.trim() },
  });
  if (res.count === 0) return { ok: false, reason: 'STATE' };
  await audit({ userId: user.id, unitId: req.unitId, action: 'PAYMENT_REJECT', module: 'PAYMENTS', entity: 'payment_request', entityId: id, ...ctx });
  const rejected = await prisma.paymentRequest.findUnique({ where: { id }, select: { requestedById: true, rejectionReason: true } });
  if (rejected?.requestedById) {
    await notifyUsers([rejected.requestedById], {
      title: 'Sua solicitação foi rejeitada',
      body: `Motivo: ${rejected.rejectionReason ?? '—'}`,
      link: '/modulos/pagamentos',
      module: 'PAYMENTS',
    });
  }
  return { ok: true };
}

/** Financeiro/Admin marca como paga. */
export async function markPaid(user: SessionUser, id: string, ctx: Ctx = {}): Promise<PayActionResult> {
  if (user.role !== 'FINANCE' && user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const req = await prisma.paymentRequest.findUnique({ where: { id }, select: { unitId: true, status: true, requestedById: true, amount: true } });
  if (!req) return { ok: false, reason: 'NOT_FOUND' };
  if (req.status !== 'APPROVED') return { ok: false, reason: 'STATE' };

  const res = await prisma.paymentRequest.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'PAID', paidById: user.id, paidAt: new Date() } });
  if (res.count === 0) return { ok: false, reason: 'STATE' };
  await audit({ userId: user.id, unitId: req.unitId, action: 'PAYMENT_PAID', module: 'PAYMENTS', entity: 'payment_request', entityId: id, ...ctx });
  if (req.requestedById) {
    await notifyUsers([req.requestedById], {
      title: 'Pagamento realizado',
      body: `O pagamento de R$ ${Number(req.amount).toFixed(2)} foi efetuado.`,
      link: '/modulos/pagamentos',
      module: 'PAYMENTS',
    });
  }
  return { ok: true };
}

/* ───────── Aprovador: ajustar a solicitação ANTES de aprovar (04/09) ───────── */

export interface ApproverEditInput {
  amount?: number;
  description?: string;
  // freelancer
  workDate?: string;
  workStartTime?: string | null;
  workEndTime?: string | null;
  workSectorId?: string;
  transportValue?: number | null;
  // hora extra
  collaboratorName?: string;
  hours?: number | null;
  reason?: string;
  // avulso
  beneficiary?: string;
}

const HM = /^\d{2}:\d{2}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Quem pode aprovar pode corrigir a solicitação antes de aprovar — dia, horário,
 * setor, vale transporte, valor, texto. Antes o aprovador só tinha "rejeitar e
 * pedir para lançar de novo", e a fila de 270 virava troca de mensagens.
 *
 * Mesma porta da aprovação: papel aprovador (ou delegado), unidade no escopo,
 * só enquanto PENDENTE. O valor do freelancer com valor/hora cadastrado é
 * recalculado do horário, como no lançamento; a divergência contra o padrão é
 * refeita. Fica na auditoria com antes/depois e o solicitante é avisado.
 */
export async function approverEditRequest(user: SessionUser, id: string, input: ApproverEditInput, ctx: Ctx = {}): Promise<PayActionResult> {
  const req = await prisma.paymentRequest.findUnique({
    where: { id },
    select: {
      unitId: true, status: true, approverRole: true, type: true, requestedById: true,
      amount: true, description: true, workDate: true, workStartTime: true, workEndTime: true, workSectorId: true,
      transportValue: true, hours: true, coverageSector: true, standardValue: true, collaboratorName: true, reason: true, beneficiary: true,
    },
  });
  if (!req) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, req.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (req.status !== 'PENDING') return { ok: false, reason: 'STATE' };
  if (req.requestedById === user.id && user.role !== 'ADMIN' && user.role !== 'CEO') return { ok: false, reason: 'FORBIDDEN' };
  const roles = await approverRolesFor(user);
  if (!roles.has(req.approverRole)) return { ok: false, reason: 'FORBIDDEN' };

  const data: Record<string, unknown> = {};
  const antes: Record<string, unknown> = {};
  const depois: Record<string, unknown> = {};
  /** Registra a mudança só quando o valor muda de fato — a auditoria mostra o que o aprovador mexeu. */
  const muda = (campo: string, de: unknown, para: unknown) => {
    const a = de instanceof Date ? de.toISOString().slice(0, 10) : de ?? null;
    const b = para ?? null;
    if (String(a ?? '') === String(b ?? '')) return;
    data[campo] = para; antes[campo] = a; depois[campo] = b;
  };

  if (input.description !== undefined) muda('description', req.description, input.description.trim() || null);

  let transport = req.transportValue != null ? Number(req.transportValue) : null;
  if (input.transportValue !== undefined && (req.type === 'FREELANCER' || req.type === 'OVERTIME')) {
    if (input.transportValue != null && !(input.transportValue >= 0)) return { ok: false, reason: 'INVALID', detail: 'Vale transporte inválido.' };
    transport = input.transportValue && input.transportValue > 0 ? Number(input.transportValue) : null;
    muda('transportValue', req.transportValue != null ? Number(req.transportValue) : null, transport);
  }

  let amount = Number(req.amount);
  let hours = req.hours;

  if (req.type === 'FREELANCER') {
    const workDate = input.workDate !== undefined ? input.workDate : (req.workDate?.toISOString().slice(0, 10) ?? null);
    if (!workDate || !YMD.test(workDate)) return { ok: false, reason: 'INVALID', detail: 'Informe o dia do trabalho.' };
    muda('workDate', req.workDate, workDate);
    if (data.workDate !== undefined) data.workDate = new Date(workDate + 'T00:00:00.000Z');

    const start = input.workStartTime !== undefined ? (input.workStartTime || null) : req.workStartTime;
    const end = input.workEndTime !== undefined ? (input.workEndTime || null) : req.workEndTime;
    if ((start && !HM.test(start)) || (end && !HM.test(end))) return { ok: false, reason: 'INVALID', detail: 'Horário inválido.' };
    if (Boolean(start) !== Boolean(end)) return { ok: false, reason: 'INVALID', detail: 'Informe hora início e hora fim.' };
    muda('workStartTime', req.workStartTime, start);
    muda('workEndTime', req.workEndTime, end);

    if (input.workSectorId !== undefined) {
      if (!input.workSectorId) return { ok: false, reason: 'INVALID', detail: 'Escolha o setor/função do freelancer.' };
      const sector = await prisma.sector.findUnique({ where: { id: input.workSectorId }, select: { unitId: true, active: true } });
      if (!sector || sector.unitId !== req.unitId || !sector.active) return { ok: false, reason: 'INVALID', detail: 'Setor não pertence a esta unidade.' };
      muda('workSectorId', req.workSectorId, input.workSectorId);
    }

    // Valor: cobertura de setor = valor do dia + VT; valor/hora cadastrado =
    // horas × valor/hora + VT; senão o que o aprovador digitar (ou o atual).
    let autoPriced = false;
    if (req.coverageSector && req.standardValue != null) {
      amount = Number(req.standardValue) + (transport ?? 0);
      autoPriced = true;
    } else if (start && end) {
      const { computeFreelancerAmount } = await import('@/lib/freelancer/pricing');
      const calc = await computeFreelancerAmount({ unitId: req.unitId, dateISO: workDate, start, end, transport: transport ?? 0 });
      if (calc.configured) { amount = calc.amount; hours = calc.hours; autoPriced = true; }
    }
    if (!autoPriced) {
      if (input.amount !== undefined) amount = Number(input.amount);
      if (req.standardValue != null) data.divergent = Math.abs(Number(req.standardValue) - amount) > 0.001;
    } else {
      data.divergent = false;
    }
    muda('hours', req.hours, hours);
  } else if (req.type === 'OVERTIME') {
    if (input.collaboratorName !== undefined) {
      if (!input.collaboratorName.trim()) return { ok: false, reason: 'INVALID', detail: 'Informe o colaborador.' };
      muda('collaboratorName', req.collaboratorName, input.collaboratorName.trim());
    }
    if (input.workDate !== undefined) {
      if (input.workDate && !YMD.test(input.workDate)) return { ok: false, reason: 'INVALID', detail: 'Data inválida.' };
      muda('workDate', req.workDate, input.workDate || null);
      if (data.workDate !== undefined && input.workDate) data.workDate = new Date(input.workDate + 'T00:00:00.000Z');
    }
    if (input.hours !== undefined) {
      if (input.hours != null && !(input.hours > 0)) return { ok: false, reason: 'INVALID', detail: 'Horas inválidas.' };
      muda('hours', req.hours, input.hours ?? null);
    }
    if (input.reason !== undefined) muda('reason', req.reason, input.reason.trim() || null);
    if (input.amount !== undefined) amount = Number(input.amount);
  } else {
    if (input.beneficiary !== undefined) muda('beneficiary', req.beneficiary, input.beneficiary.trim() || null);
    if (input.amount !== undefined) amount = Number(input.amount);
  }

  if (!(amount > 0)) return { ok: false, reason: 'INVALID', detail: 'Informe o valor.' };
  amount = Math.round(amount * 100) / 100;
  muda('amount', Number(req.amount), amount);

  // Só "divergent" recalculado, sem outro campo mudado, não é edição.
  const camposMudados = Object.keys(depois);
  if (camposMudados.length === 0) return { ok: true };
  await prisma.paymentRequest.update({ where: { id }, data });
  await audit({ userId: user.id, unitId: req.unitId, action: 'PAYMENT_APPROVER_EDIT', module: 'PAYMENTS', entity: 'payment_request', entityId: id, metadata: { type: req.type, antes, depois }, ...ctx });
  if (req.requestedById && req.requestedById !== user.id) {
    const visiveis = camposMudados.filter((c) => c !== 'hours');
    const oQue = req.type === 'FREELANCER' ? 'freelancer' : req.type === 'OVERTIME' ? 'pedido de hora extra' : 'pagamento avulso';
    await notifyUsers([req.requestedById], {
      title: 'Sua solicitação foi ajustada antes da aprovação',
      body: user.name + ' corrigiu ' + visiveis.length + ' campo(s) do ' + oQue + '. Valor agora: R$ ' + amount.toFixed(2) + '.',
      link: '/modulos/pagamentos', module: 'PAYMENTS',
    }).catch(() => {});
  }
  return { ok: true };
}

/* ───────── Admin: editar / excluir histórico (Módulo 7) ───────── */
export async function adminEditPayment(user: SessionUser, id: string, input: { amount?: number; description?: string }, ctx: Ctx = {}): Promise<PayActionResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const p = await prisma.paymentRequest.findUnique({ where: { id }, select: { unitId: true } });
  if (!p) return { ok: false, reason: 'NOT_FOUND' };
  if (input.amount !== undefined && !(input.amount > 0)) return { ok: false, reason: 'INVALID' };
  await prisma.paymentRequest.update({
    where: { id },
    data: {
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
    },
  });
  await audit({ userId: user.id, unitId: p.unitId, action: 'PAYMENT_ADMIN_EDIT', module: 'PAYMENTS', entity: 'payment_request', entityId: id, metadata: { fields: Object.keys(input) }, ...ctx });
  return { ok: true };
}

export async function adminDeletePayment(user: SessionUser, id: string, ctx: Ctx = {}): Promise<PayActionResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const p = await prisma.paymentRequest.findUnique({ where: { id }, select: { unitId: true } });
  if (!p) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.paymentRequest.delete({ where: { id } });
  await audit({ userId: user.id, unitId: p.unitId, action: 'PAYMENT_ADMIN_DELETE', module: 'PAYMENTS', entity: 'payment_request', entityId: id, ...ctx });
  return { ok: true };
}
