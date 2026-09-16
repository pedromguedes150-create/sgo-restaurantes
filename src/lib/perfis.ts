import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { ALL_ROLES, isFullAccess, MODULES } from '@/lib/permissions';
import { roleLabel } from '@/lib/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { Role } from '@prisma/client';

/**
 * Gestão de Perfis de acesso.
 *
 * Um perfil personalizado é "um perfil de sistema, com outras telas". O que ele
 * muda é a matriz Ver/Editar; o que ele HERDA são as regras de negócio, pelo
 * `baseRole` (ver o comentário do model `Profile`).
 */

export type ResultadoPerfil =
  | { ok: true; id?: string }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'CONFLICT' | 'BLOCKED'; message?: string };

function isAdmin(user: SessionUser) {
  return user.role === 'ADMIN';
}

export interface PerfilRow {
  id: string;
  name: string;
  baseRole: Role;
  baseRoleLabel: string;
  active: boolean;
  usuarios: number;
  ajustes: number;
}

export async function listarPerfis(): Promise<PerfilRow[]> {
  const perfis = await prisma.profile.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, baseRole: true, active: true, _count: { select: { users: true, permissions: true } } },
  });
  return perfis.map((p) => ({
    id: p.id,
    name: p.name,
    baseRole: p.baseRole,
    baseRoleLabel: roleLabel(p.baseRole),
    active: p.active,
    usuarios: p._count.users,
    ajustes: p._count.permissions,
  }));
}

/** Perfis que podem ser escolhidos no cadastro de usuário. */
export async function perfisAtivos() {
  return prisma.profile.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, baseRole: true },
  });
}

/**
 * Perfis de sistema que podem servir de base.
 *
 * ADMIN e CEO ficam de fora: `isFullAccess` curto-circuita a matriz, então um
 * perfil herdado deles teria acesso total E seria impossível de restringir —
 * marcar as caixas não faria nada. Seria uma porta dos fundos com cara de
 * configuração.
 */
export function basesPossiveis(): { value: Role; label: string }[] {
  return ALL_ROLES.filter((r) => !isFullAccess(r)).map((r) => ({ value: r, label: roleLabel(r) }));
}

function baseValida(baseRole: Role): boolean {
  return ALL_ROLES.includes(baseRole) && !isFullAccess(baseRole);
}

export async function criarPerfil(
  user: SessionUser,
  input: { name: string; baseRole: Role },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoPerfil> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const name = input.name?.trim();
  if (!name || name.length > 60) return { ok: false, reason: 'INVALID' };
  if (!baseValida(input.baseRole)) {
    return { ok: false, reason: 'INVALID', message: 'Escolha um perfil base. Administrador e CEO não servem de base: eles têm acesso total, e a matriz não se aplica a eles.' };
  }
  if (await prisma.profile.findUnique({ where: { name } })) {
    return { ok: false, reason: 'CONFLICT', message: 'Já existe um perfil com esse nome.' };
  }
  const p = await prisma.profile.create({ data: { name, baseRole: input.baseRole } });
  await audit({ userId: user.id, action: 'PROFILE_CREATE', module: 'CONFIG', entity: 'profile', entityId: p.id, metadata: { name, baseRole: input.baseRole }, ...ctx });
  return { ok: true, id: p.id };
}

export async function renomearPerfil(
  user: SessionUser,
  input: { id: string; name: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoPerfil> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const name = input.name?.trim();
  if (!name || name.length > 60) return { ok: false, reason: 'INVALID' };
  const atual = await prisma.profile.findUnique({ where: { id: input.id }, select: { id: true } });
  if (!atual) return { ok: false, reason: 'INVALID' };
  const colide = await prisma.profile.findUnique({ where: { name } });
  if (colide && colide.id !== input.id) return { ok: false, reason: 'CONFLICT', message: 'Já existe um perfil com esse nome.' };
  await prisma.profile.update({ where: { id: input.id }, data: { name } });
  await audit({ userId: user.id, action: 'PROFILE_UPDATE', module: 'CONFIG', entity: 'profile', entityId: input.id, metadata: { name }, ...ctx });
  return { ok: true };
}

/**
 * Trocar o perfil base REESCREVE o `role` de quem usa o perfil.
 *
 * O sistema inteiro consulta o banco por perfil — notificar a supervisão,
 * listar aprovadores de pagamento, montar a escala de gerentes. Deixar o `role`
 * antigo nos usuários faria o perfil mudar na tela e não mudar em lugar nenhum
 * que importa.
 */
export async function trocarBaseDoPerfil(
  user: SessionUser,
  input: { id: string; baseRole: Role },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoPerfil> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!baseValida(input.baseRole)) return { ok: false, reason: 'INVALID' };
  const atual = await prisma.profile.findUnique({ where: { id: input.id }, select: { baseRole: true } });
  if (!atual) return { ok: false, reason: 'INVALID' };
  if (atual.baseRole === input.baseRole) return { ok: true };

  const afetados = await prisma.$transaction(async (tx) => {
    await tx.profile.update({ where: { id: input.id }, data: { baseRole: input.baseRole } });
    const r = await tx.user.updateMany({ where: { profileId: input.id }, data: { role: input.baseRole } });
    return r.count;
  });
  await audit({ userId: user.id, action: 'PROFILE_BASE_CHANGE', module: 'CONFIG', entity: 'profile', entityId: input.id, metadata: { de: atual.baseRole, para: input.baseRole, usuarios: afetados }, ...ctx });
  return { ok: true };
}

export async function alternarPerfil(
  user: SessionUser,
  input: { id: string; active: boolean },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoPerfil> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.profile.findUnique({ where: { id: input.id }, select: { id: true } });
  if (!atual) return { ok: false, reason: 'INVALID' };
  /* Desativar é permitido mesmo com usuários: eles voltam ao perfil de sistema
     (o `baseRole`, que já está no `role` deles) em vez de perder o acesso de
     uma vez. Quem estiver logado sente no request seguinte. */
  await prisma.profile.update({ where: { id: input.id }, data: { active: Boolean(input.active) } });
  await audit({ userId: user.id, action: 'PROFILE_TOGGLE', module: 'CONFIG', entity: 'profile', entityId: input.id, metadata: { active: input.active }, ...ctx });
  return { ok: true };
}

export async function excluirPerfil(
  user: SessionUser,
  id: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoPerfil> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.profile.findUnique({ where: { id }, select: { _count: { select: { users: true } } } });
  if (!atual) return { ok: false, reason: 'INVALID' };
  if (atual._count.users > 0) {
    return {
      ok: false,
      reason: 'BLOCKED',
      message: `Há ${atual._count.users} usuário(s) com este perfil. Mude-os de perfil antes de excluir, ou apenas desative — desativado, ele some do cadastro de usuários e quem já o usa volta ao perfil base.`,
    };
  }
  await prisma.profile.delete({ where: { id } }); // as permissões vão junto (Cascade)
  await audit({ userId: user.id, action: 'PROFILE_DELETE', module: 'CONFIG', entity: 'profile', entityId: id, ...ctx });
  return { ok: true };
}

/** Uma célula da matriz de um perfil personalizado. */
export async function definirPermissaoDoPerfil(
  user: SessionUser,
  input: { profileId: string; module: string; canView: boolean; canEdit: boolean },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoPerfil> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!MODULES.some((m) => m.key === input.module)) return { ok: false, reason: 'INVALID' };
  const perfil = await prisma.profile.findUnique({ where: { id: input.profileId }, select: { id: true } });
  if (!perfil) return { ok: false, reason: 'INVALID' };
  const canView = Boolean(input.canView);
  const canEdit = canView && Boolean(input.canEdit); // sem ver, não edita
  await prisma.profilePermission.upsert({
    where: { profileId_module: { profileId: input.profileId, module: input.module } },
    create: { profileId: input.profileId, module: input.module, canView, canEdit },
    update: { canView, canEdit },
  });
  await audit({ userId: user.id, action: 'PROFILE_PERMISSION_SET', module: 'CONFIG', entity: 'profile', entityId: input.profileId, metadata: { module: input.module, canView, canEdit }, ...ctx });
  return { ok: true };
}
