import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError, unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUnitRole, notifyAdmins, notifyUsers } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { NoticeType } from '@prisma/client';

type Ctx = { ip?: string | null; userAgent?: string | null };

/** Tempo de empresa (texto) a partir da data de admissão 'YYYY-MM-DD'. */
export function tenureText(hireDate: string | null): string | null {
  if (!hireDate || !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) return null;
  const [y, m, d] = hireDate.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const now = new Date();
  let months = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth());
  if (now.getUTCDate() < d) months -= 1;
  if (months < 0) months = 0;
  const yy = Math.floor(months / 12), mm = months % 12;
  const parts = [];
  if (yy > 0) parts.push(`${yy} ano${yy > 1 ? 's' : ''}`);
  parts.push(`${mm} ${mm === 1 ? 'mês' : 'meses'}`);
  return parts.join(', ');
}

/** Contexto do colaborador p/ o formulário: admissão/tempo de empresa + atestados. */
export async function getTerminationContext(user: SessionUser, collaboratorId: string) {
  const c = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { name: true, hireDate: true } });
  if (!c) return null;
  const certs = await prisma.medicalCertificate.findMany({ where: { collaboratorId }, select: { days: true } });
  const certCount = certs.length;
  const certDays = certs.reduce((s, x) => s + (x.days ?? 0), 0);
  return { name: c.name, hireDate: c.hireDate, tenure: tenureText(c.hireDate), certCount, certDays };
}

export interface CreateTerminationInput {
  unitId: string; collaboratorId: string; noticeType: NoticeType;
  noticeJustification?: string; reason: string; ageYears?: number;
}
export type TermResult = { ok: true; id: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

export async function createTermination(user: SessionUser, input: CreateTerminationInput, ctx: Ctx = {}): Promise<TermResult> {
  try { assertUnitAccess(user, input.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  if (!input.collaboratorId || !input.reason?.trim() || !['WORKED', 'INDEMNIFIED'].includes(input.noticeType)) return { ok: false, reason: 'INVALID' };
  const link = await prisma.collaboratorUnit.findUnique({ where: { collaboratorId_unitId: { collaboratorId: input.collaboratorId, unitId: input.unitId } }, select: { id: true } });
  if (!link) return { ok: false, reason: 'NOT_FOUND' };
  const ctx2 = await getTerminationContext(user, input.collaboratorId);
  if (!ctx2) return { ok: false, reason: 'NOT_FOUND' };

  const rec = await prisma.termination.create({
    data: {
      unitId: input.unitId, collaboratorId: input.collaboratorId, requestedById: user.id,
      noticeType: input.noticeType, noticeJustification: input.noticeJustification?.trim() || null, reason: input.reason.trim(),
      collaboratorName: ctx2.name, ageYears: input.ageYears && input.ageYears > 0 ? Math.trunc(input.ageYears) : null,
      tenureText: ctx2.tenure, certCount: ctx2.certCount, certDays: ctx2.certDays,
    },
    select: { id: true },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'TERMINATION_REQUEST', module: 'PEOPLE', entity: 'termination', entityId: rec.id, ...ctx });
  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { name: true } });
  const payload = { title: 'Solicitação de desligamento', body: `${user.name} solicitou o desligamento de ${ctx2.name} (${unit?.name ?? ''}). Aprove ou recuse.`, link: '/modulos/desligamentos', module: 'PEOPLE' as const };
  await notifyUnitRole(input.unitId, 'SUPERVISOR', payload);
  await notifyAdmins(payload);
  return { ok: true, id: rec.id };
}

export async function decideTermination(user: SessionUser, id: string, approve: boolean, rejectionReason: string | undefined, ctx: Ctx = {}): Promise<TermResult> {
  if (!['SUPERVISOR', 'ADMIN', 'CEO'].includes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const t = await prisma.termination.findUnique({ where: { id }, select: { unitId: true, status: true, requestedById: true, collaboratorName: true } });
  if (!t) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, t.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (t.status !== 'PENDING') return { ok: false, reason: 'INVALID' };
  if (!approve && !rejectionReason?.trim()) return { ok: false, reason: 'INVALID' };

  await prisma.termination.update({
    where: { id },
    data: { status: approve ? 'APPROVED' : 'REJECTED', approvedById: user.id, approvedAt: new Date(), rejectionReason: approve ? null : rejectionReason!.trim() },
  });
  await audit({ userId: user.id, unitId: t.unitId, action: approve ? 'TERMINATION_APPROVE' : 'TERMINATION_REJECT', module: 'PEOPLE', entity: 'termination', entityId: id, ...ctx });
  if (t.requestedById) {
    await notifyUsers([t.requestedById], {
      title: approve ? '✅ Desligamento aprovado' : '❌ Desligamento recusado',
      body: `${t.collaboratorName}: ${approve ? 'aprovado pelo supervisor — encaminhar ao RH.' : `recusado — ${rejectionReason!.trim()}`}`,
      link: '/modulos/desligamentos', module: 'PEOPLE',
    });
  }
  return { ok: true, id };
}

export async function listTerminations(user: SessionUser) {
  return prisma.termination.findMany({
    where: { ...unitScopeWhere(user, 'unitId') },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: { unit: { select: { name: true } }, requestedBy: { select: { name: true } }, approvedBy: { select: { name: true } } },
  });
}

export async function getTermination(user: SessionUser, id: string) {
  const t = await prisma.termination.findUnique({ where: { id }, include: { unit: { select: { name: true, code: true } }, requestedBy: { select: { name: true } }, approvedBy: { select: { name: true } } } });
  if (!t || !canAccessUnit(user, t.unitId)) return null;
  return t;
}
