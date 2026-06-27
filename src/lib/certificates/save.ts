import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
import { registerAbsence } from '@/lib/schedule';
import type { SessionUser } from '@/lib/auth/session';
import type { CertificateType } from '@prisma/client';

export interface CreateCertInput {
  unitId: string;
  collaboratorId: string;
  type?: CertificateType;
  issueDate?: string;
  startDate: string;
  endDate: string;
  hours?: number;
  doctorName?: string;
  doctorCrm?: string;
  cid?: string;
  cidDescription?: string;
  observation?: string;
  attachmentPath?: string;
  aiExtracted?: unknown;
}
export type CreateCertResult =
  | { ok: true; id: string; days: number }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'DUPLICATE' | 'NO_LINK' };

type Ctx = { ip?: string | null; userAgent?: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function dayUTC(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
/** Dias de afastamento (inclusivo). */
export function daysBetween(start: string, end: string): number {
  return Math.floor((dayUTC(end).getTime() - dayUTC(start).getTime()) / 86_400_000) + 1;
}

/** Registra um atestado e, quando afasta o dia, marca a Escala como "Atestado". */
export async function createCertificate(user: SessionUser, input: CreateCertInput, ctx: Ctx = {}): Promise<CreateCertResult> {
  try { assertUnitAccess(user, input.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  if (!input.collaboratorId) return { ok: false, reason: 'INVALID' };
  if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate)) return { ok: false, reason: 'INVALID' };
  if (dayUTC(input.endDate) < dayUTC(input.startDate)) return { ok: false, reason: 'INVALID' };
  if (input.issueDate && !DATE_RE.test(input.issueDate)) return { ok: false, reason: 'INVALID' };

  // Colaborador precisa estar vinculado a esta unidade (consistência das métricas)
  const link = await prisma.collaboratorUnit.findUnique({
    where: { collaboratorId_unitId: { collaboratorId: input.collaboratorId, unitId: input.unitId } },
    select: { id: true },
  });
  if (!link) return { ok: false, reason: 'NO_LINK' };

  const type: CertificateType = input.type ?? 'FULL_DAY';
  const days = type === 'HOURS' ? 1 : daysBetween(input.startDate, input.endDate);

  // Anti-duplicidade: mesmo colaborador + início + fim já lançado
  const dup = await prisma.medicalCertificate.findFirst({
    where: { collaboratorId: input.collaboratorId, startDate: input.startDate, endDate: input.endDate },
    select: { id: true },
  });
  if (dup) return { ok: false, reason: 'DUPLICATE' };

  const rec = await prisma.medicalCertificate.create({
    data: {
      unitId: input.unitId,
      collaboratorId: input.collaboratorId,
      type,
      issueDate: input.issueDate || null,
      startDate: input.startDate,
      endDate: input.endDate,
      days,
      hours: type === 'HOURS' && input.hours != null && input.hours > 0 ? input.hours : null,
      doctorName: input.doctorName?.trim() || null,
      doctorCrm: input.doctorCrm?.trim() || null,
      cid: input.cid?.trim() || null,
      cidDescription: input.cidDescription?.trim() || null,
      observation: input.observation?.trim() || null,
      attachmentPath: input.attachmentPath || null,
      aiExtracted: (input.aiExtracted as object) ?? undefined,
      createdById: user.id,
    },
    select: { id: true },
  });

  // Marca a Escala como "Atestado" no período (afasta o dia). HOURS não afasta o dia todo.
  if (type !== 'HOURS') {
    await registerAbsence(user, {
      collaboratorId: input.collaboratorId,
      unitId: input.unitId,
      status: 'ATESTADO',
      start: input.startDate,
      end: input.endDate,
      reason: type === 'COMPANION' ? 'Acompanhamento (atestado)' : 'Atestado médico',
      attachmentPath: input.attachmentPath || undefined,
    }, ctx).catch(() => {}); // não bloqueia o atestado se a Escala falhar
  }

  await audit({ userId: user.id, unitId: input.unitId, action: 'CERTIFICATE_CREATE', module: 'PEOPLE', entity: 'medical_certificate', entityId: rec.id, metadata: { type, days, start: input.startDate, end: input.endDate }, ...ctx });

  // Avisa o RH (Admins) — eles controlam no sistema próprio e mandam à contabilidade
  const [unit, collab] = await Promise.all([
    prisma.unit.findUnique({ where: { id: input.unitId }, select: { name: true } }),
    prisma.collaborator.findUnique({ where: { id: input.collaboratorId }, select: { name: true } }),
  ]);
  await notifyAdmins({
    title: 'Novo atestado registrado',
    body: `${user.name} lançou um atestado de ${collab?.name ?? 'colaborador'} (${days} dia(s)) em ${unit?.name ?? ''}. Avise o RH.`,
    link: `/modulos/atestados`,
    module: 'PEOPLE',
  });

  return { ok: true, id: rec.id, days };
}
