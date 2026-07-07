import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { ProbationStatus } from '@prisma/client';

const PROBATION_DAYS = 90;
type Ctx = { ip?: string | null; userAgent?: string | null };

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoDaysAgo(n: number): string {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysSince(hireDate: string): number {
  const h = new Date(hireDate + 'T00:00:00');
  return Math.floor((Date.now() - h.getTime()) / (24 * 60 * 60 * 1000));
}

export interface ProbationRow {
  collaboratorId: string; name: string; jobTitle: string | null; unit: string;
  hireDate: string; days: number; daysLeft: number;
  status: ProbationStatus; notes: string | null; decidedByName: string | null; decidedAt: string | null;
}

/** Colaboradores com ≤90 dias de casa (admissão do RH), com a avaliação do gestor. */
export async function listProbation(user: SessionUser): Promise<ProbationRow[]> {
  const today = todayISO();
  const cutoff = isoDaysAgo(PROBATION_DAYS);
  const collabs = await prisma.collaborator.findMany({
    where: {
      active: true,
      hireDate: { gte: cutoff, lte: today },
      units: { some: { ...unitScopeWhere(user, 'unitId') } },
    },
    include: { units: { select: { unit: { select: { name: true } } } } },
    orderBy: { hireDate: 'desc' },
    take: 300,
  });
  const reviews = await prisma.probationReview.findMany({ where: { collaboratorId: { in: collabs.map((c) => c.id) } } });
  const byCollab = new Map(reviews.map((r) => [r.collaboratorId, r]));
  return collabs.map((c) => {
    const r = byCollab.get(c.id);
    const days = c.hireDate ? daysSince(c.hireDate) : 0;
    return {
      collaboratorId: c.id, name: c.name, jobTitle: c.jobTitle, unit: c.units.map((u) => u.unit.name).join(', ') || '—',
      hireDate: c.hireDate ?? '', days, daysLeft: Math.max(0, PROBATION_DAYS - days),
      status: r?.status ?? 'PENDING', notes: r?.notes ?? null, decidedByName: r?.decidedByName ?? null,
      decidedAt: r?.decidedAt ? r.decidedAt.toISOString() : null,
    };
  });
}

type Result = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

/** Registra a avaliação do período de experiência (aprovar/reprovar + anotações). */
export async function reviewProbation(user: SessionUser, collaboratorId: string, input: { status: ProbationStatus; notes?: string }, ctx: Ctx = {}): Promise<Result> {
  if (user.role === 'FINANCE') return { ok: false, reason: 'FORBIDDEN' };
  if (input.status !== 'APPROVED' && input.status !== 'REJECTED' && input.status !== 'PENDING') return { ok: false, reason: 'INVALID' };
  const collab = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { name: true, units: { select: { unitId: true } } } });
  if (!collab) return { ok: false, reason: 'NOT_FOUND' };
  const unitId = collab.units.find((u) => canAccessUnit(user, u.unitId))?.unitId;
  if (!unitId) return { ok: false, reason: 'FORBIDDEN' };
  const decided = input.status !== 'PENDING';

  await prisma.probationReview.upsert({
    where: { collaboratorId },
    create: {
      collaboratorId, collaboratorName: collab.name, unitId, status: input.status, notes: input.notes?.trim() || null,
      decidedById: decided ? user.id : null, decidedByName: decided ? user.name : null, decidedAt: decided ? new Date() : null,
    },
    update: {
      status: input.status, notes: input.notes?.trim() || null,
      decidedById: decided ? user.id : null, decidedByName: decided ? user.name : null, decidedAt: decided ? new Date() : null,
    },
  });
  await audit({ userId: user.id, unitId, action: `PROBATION_${input.status}`, module: 'PEOPLE', entity: 'probation_review', entityId: collaboratorId, metadata: { name: collab.name }, ...ctx });
  if (decided) {
    await notifyAdmins({
      title: `Experiência ${input.status === 'APPROVED' ? 'aprovada' : 'reprovada'}`,
      body: `${user.name} ${input.status === 'APPROVED' ? 'aprovou' : 'reprovou'} o período de experiência de ${collab.name}. Avise o RH.`,
      link: '/modulos/pessoas/experiencia', module: 'PEOPLE',
    });
  }
  return { ok: true };
}
