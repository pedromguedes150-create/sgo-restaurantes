import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Mudança de função/setor → RH (item 12, Onda 3).
 * - FUNCTION: o cadastro (cargo) vem do RH e o sync sobrescreve — então a mudança
 *   de função é um REGISTRO/solicitação que notifica os Admins para efetivar no
 *   RH; quando o RH efetivar, o sync diário traz o cargo novo.
 * - SECTOR: setor é do SGO (Mapa de Funções) — muda de verdade via
 *   updateAllocation, que registra aqui para o RH ficar sabendo.
 * Futura API do RH pluga neste registro.
 */
type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' };

/** Solicita mudança de função (cargo) — registro + aviso aos Admins (efetiva no RH). */
export async function requestFunctionChange(user: SessionUser, collaboratorId: string, newTitle: string, ctx: Ctx = {}): Promise<Result> {
  if (user.role === 'FINANCE') return { ok: false, reason: 'FORBIDDEN' };
  const title = newTitle?.trim();
  if (!title || title.length > 120) return { ok: false, reason: 'INVALID' };
  const collab = await prisma.collaborator.findUnique({
    where: { id: collaboratorId },
    select: { name: true, jobTitle: true, units: { select: { unitId: true, unit: { select: { name: true } } } } },
  });
  if (!collab) return { ok: false, reason: 'NOT_FOUND' };
  const unit = collab.units.find((u) => canAccessUnit(user, u.unitId));
  if (!unit) return { ok: false, reason: 'FORBIDDEN' };
  if ((collab.jobTitle ?? '').trim().toLowerCase() === title.toLowerCase()) return { ok: false, reason: 'INVALID' };

  await prisma.roleChange.create({
    data: {
      collaboratorId, collaboratorName: collab.name, unitId: unit.unitId, kind: 'FUNCTION',
      fromValue: collab.jobTitle, toValue: title, requestedById: user.id, requestedByName: user.name,
    },
  });
  await audit({
    userId: user.id, unitId: unit.unitId, action: 'ROLE_CHANGE_FUNCTION', module: 'PEOPLE',
    entity: 'role_change', entityId: collaboratorId, metadata: { name: collab.name, from: collab.jobTitle, to: title }, ...ctx,
  });
  await notifyAdmins({
    title: 'Mudança de função solicitada',
    body: `${user.name} pediu mudança de função de ${collab.name}: ${collab.jobTitle || 'sem função'} → ${title} (${unit.unit.name}). Efetive no RH — o cargo atualiza no SGO no próximo sync.`,
    link: '/modulos/pessoas/mudancas', module: 'PEOPLE',
  });
  return { ok: true };
}

/** Registra mudança de setor (chamado pelo updateAllocation do Mapa). */
export async function recordSectorChange(
  user: SessionUser,
  data: { collaboratorId: string; collaboratorName: string; unitId: string; from: string | null; to: string },
): Promise<void> {
  await prisma.roleChange.create({
    data: {
      collaboratorId: data.collaboratorId, collaboratorName: data.collaboratorName, unitId: data.unitId,
      kind: 'SECTOR', fromValue: data.from, toValue: data.to, requestedById: user.id, requestedByName: user.name,
    },
  });
  const unit = await prisma.unit.findUnique({ where: { id: data.unitId }, select: { name: true } });
  await notifyAdmins({
    title: 'Mudança de setor no Mapa',
    body: `${user.name} moveu ${data.collaboratorName} de ${data.from ?? '—'} para ${data.to} (${unit?.name ?? ''}). Avise o RH.`,
    link: '/modulos/pessoas/mudancas', module: 'PEOPLE',
  });
}

export interface RoleChangeRow {
  id: string; collaboratorName: string; unitName: string; kind: 'FUNCTION' | 'SECTOR';
  fromValue: string | null; toValue: string; requestedByName: string; createdAt: string;
}

/** Registro consolidado (escopo do usuário), mais recentes primeiro. */
export async function listRoleChanges(user: SessionUser): Promise<RoleChangeRow[]> {
  const rows = await prisma.roleChange.findMany({
    where: { ...unitScopeWhere(user, 'unitId') },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  const unitIds = [...new Set(rows.map((r) => r.unitId))];
  const units = await prisma.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true } });
  const unitBy = new Map(units.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id, collaboratorName: r.collaboratorName, unitName: unitBy.get(r.unitId) ?? '—',
    kind: r.kind, fromValue: r.fromValue, toValue: r.toValue, requestedByName: r.requestedByName,
    createdAt: r.createdAt.toISOString(),
  }));
}
