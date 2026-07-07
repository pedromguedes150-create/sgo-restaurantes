import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Trocas de escala → RH (item 15, Onda 3). Registro local + notificação aos
 * Admins; a futura API do RH pluga aqui. Formas de troca:
 *  - mesmo colaborador mudando de dia (B vazio, dateB preenchida);
 *  - dois colaboradores trocando entre si (A no dia de B e vice-versa).
 */
type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const fmtBR = (iso: string) => iso.split('-').reverse().join('/');

export async function createScheduleChange(
  user: SessionUser,
  input: { unitId: string; collaboratorAId: string; dateA: string; collaboratorBId?: string; dateB?: string; reason?: string },
  ctx: Ctx = {},
): Promise<Result> {
  if (user.role === 'FINANCE') return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!DATE_RE.test(input.dateA ?? '')) return { ok: false, reason: 'INVALID' };
  if (input.dateB && !DATE_RE.test(input.dateB)) return { ok: false, reason: 'INVALID' };
  // precisa haver "para onde" trocar: outro colaborador e/ou outra data
  if (!input.collaboratorBId && !input.dateB) return { ok: false, reason: 'INVALID' };

  const [a, b, unit] = await Promise.all([
    prisma.collaborator.findUnique({ where: { id: input.collaboratorAId }, select: { name: true, units: { select: { unitId: true } } } }),
    input.collaboratorBId ? prisma.collaborator.findUnique({ where: { id: input.collaboratorBId }, select: { name: true, units: { select: { unitId: true } } } }) : Promise.resolve(null),
    prisma.unit.findUnique({ where: { id: input.unitId }, select: { name: true } }),
  ]);
  if (!a || !a.units.some((u) => u.unitId === input.unitId)) return { ok: false, reason: 'NOT_FOUND' };
  if (input.collaboratorBId && (!b || !b.units.some((u) => u.unitId === input.unitId))) return { ok: false, reason: 'NOT_FOUND' };

  const c = await prisma.scheduleChange.create({
    data: {
      unitId: input.unitId,
      collaboratorAId: input.collaboratorAId, collaboratorAName: a.name, dateA: input.dateA,
      collaboratorBId: input.collaboratorBId || null, collaboratorBName: b?.name ?? null, dateB: input.dateB || null,
      reason: input.reason?.trim() || null,
      createdById: user.id, createdByName: user.name,
    },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'SCHEDULE_CHANGE', module: 'PEOPLE', entity: 'schedule_change', entityId: c.id, metadata: { a: a.name, b: b?.name, dateA: input.dateA, dateB: input.dateB }, ...ctx });

  const desc = b
    ? `${a.name} (${fmtBR(input.dateA)}) ⇄ ${b.name}${input.dateB ? ` (${fmtBR(input.dateB)})` : ''}`
    : `${a.name}: ${fmtBR(input.dateA)} → ${fmtBR(input.dateB!)}`;
  await notifyAdmins({
    title: 'Troca de escala registrada',
    body: `${user.name} registrou troca em ${unit?.name ?? 'unidade'}: ${desc}${input.reason?.trim() ? ` — ${input.reason.trim()}` : ''}. Informe o RH.`,
    link: '/modulos/escala/trocas', module: 'PEOPLE',
  });
  return { ok: true };
}

export interface ScheduleChangeRow {
  id: string; unitName: string; collaboratorAName: string; dateA: string;
  collaboratorBName: string | null; dateB: string | null; reason: string | null;
  createdByName: string; createdAt: string;
}

export async function listScheduleChanges(user: SessionUser): Promise<ScheduleChangeRow[]> {
  const rows = await prisma.scheduleChange.findMany({
    where: { ...unitScopeWhere(user, 'unitId') },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  const units = await prisma.unit.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.unitId))] } }, select: { id: true, name: true } });
  const unitBy = new Map(units.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id, unitName: unitBy.get(r.unitId) ?? '—',
    collaboratorAName: r.collaboratorAName, dateA: r.dateA,
    collaboratorBName: r.collaboratorBName, dateB: r.dateB, reason: r.reason,
    createdByName: r.createdByName, createdAt: r.createdAt.toISOString(),
  }));
}
