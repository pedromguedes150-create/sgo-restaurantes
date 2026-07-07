import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { Role } from '@prisma/client';

/**
 * Perfis de acesso (Fase C) — matriz perfil × módulo (ver/editar).
 * Perfis continuam fixos (enum Role). O Admin ajusta o que cada um pode.
 * SEM linha cadastrada = padrão liberado (preserva o comportamento atual).
 * ADMIN e CEO sempre têm acesso total (não podem se trancar para fora).
 */

export const MODULES: { key: string; label: string; nav?: string }[] = [
  { key: 'DASHBOARD', label: 'Dashboard', nav: '/dashboard' },
  { key: 'MANAGER_AREA', label: 'Minha área', nav: '/minha-area' },
  { key: 'LEAVES_TEAM', label: 'Consolidado de Folgas/Férias', nav: '/modulos/folgas-equipe' },
  { key: 'TASKS', label: 'Tarefas', nav: '/tarefas' },
  { key: 'COMMUNICATION', label: 'Central de Comunicação', nav: '/modulos/comunicacao' },
  { key: 'HELP', label: 'Treinamento da Plataforma', nav: '/ajuda' },
  { key: 'WASTE', label: 'Desperdícios', nav: '/modulos/desperdicios' },
  { key: 'OCCURRENCES', label: 'Ocorrências', nav: '/modulos/ocorrencias' },
  { key: 'MAINTENANCE', label: 'Manutenção', nav: '/modulos/manutencao' },
  { key: 'COMMANDS', label: 'Comandas', nav: '/modulos/comandas' },
  { key: 'CASH', label: 'Gestão de Troco', nav: '/modulos/troco' },
  { key: 'CANCELLATIONS', label: 'Cancelamentos', nav: '/modulos/cancelamentos' },
  { key: 'INVENTORY', label: 'Inventário', nav: '/modulos/inventario' },
  { key: 'NOTES', label: 'Notas Recebidas', nav: '/modulos/notas' },
  { key: 'GAS', label: 'Recebimento de Gás', nav: '/modulos/gas' },
  { key: 'OIL', label: 'Coleta de Óleo', nav: '/modulos/oleo' },
  { key: 'PAYMENTS', label: 'Pagamentos', nav: '/modulos/pagamentos' },
  { key: 'PEOPLE', label: 'Pessoas / Escala / Mapa', nav: '/modulos/pessoas' },
  { key: 'CERTIFICATES', label: 'Atestados', nav: '/modulos/atestados' },
  { key: 'TERMINATIONS', label: 'Desligamentos', nav: '/modulos/desligamentos' },
  { key: 'POPS', label: 'POPs', nav: '/modulos/pops' },
  { key: 'TRAINING', label: 'Treinamentos', nav: '/modulos/treinamentos' },
  { key: 'METAS', label: 'Metas', nav: '/modulos/metas' },
  { key: 'SUPERVISION', label: 'Rotina do Supervisor', nav: '/modulos/supervisao' },
  { key: 'EXECUTIVE', label: 'Visão Executiva', nav: '/modulos/executivo' },
  { key: 'AUDIT', label: 'Auditoria', nav: '/auditoria' },
  { key: 'CONFIG', label: 'Configurações', nav: '/configuracoes' },
];

export const ALL_ROLES: Role[] = ['CEO', 'ADMIN', 'SUPERVISOR', 'COORDINATOR', 'MANAGER', 'FINANCE'];
function isFullAccess(role: Role) { return role === 'ADMIN' || role === 'CEO'; }

export interface Perm { canView: boolean; canEdit: boolean }

// Módulos restritos por padrão: só os perfis listados veem se não houver config
// explícita (ADMIN/CEO sempre veem). Admin pode liberar/restringir na matriz.
const RESTRICTED_DEFAULT: Record<string, Role[]> = {
  LEAVES_TEAM: ['SUPERVISOR'],
  SUPERVISION: ['SUPERVISOR'],
  EXECUTIVE: [], // só ADMIN/CEO por padrão (Admin pode liberar na matriz)
};

/** Permissões efetivas de um perfil por módulo (com defaults). */
export async function effectivePermissions(role: Role): Promise<Record<string, Perm>> {
  const rows = await prisma.rolePermission.findMany({ where: { role } });
  const byModule = new Map(rows.map((r) => [r.module, r]));
  const out: Record<string, Perm> = {};
  for (const m of MODULES) {
    if (isFullAccess(role)) { out[m.key] = { canView: true, canEdit: true }; continue; }
    const r = byModule.get(m.key);
    const restricted = RESTRICTED_DEFAULT[m.key];
    const def = restricted ? restricted.includes(role) : true;
    out[m.key] = { canView: r ? r.canView : def, canEdit: r ? r.canEdit : def };
  }
  return out;
}

/** Conjunto de hrefs de navegação que o perfil pode VER (para a sidebar). */
export async function viewableNavHrefs(role: Role): Promise<string[]> {
  const perms = await effectivePermissions(role);
  return MODULES.filter((m) => m.nav && perms[m.key]?.canView).map((m) => m.nav!) as string[];
}

/** Matriz completa (todos os perfis) para a tela de administração. */
export async function permissionMatrix(): Promise<Record<Role, Record<string, Perm>>> {
  const out = {} as Record<Role, Record<string, Perm>>;
  for (const role of ALL_ROLES) out[role] = await effectivePermissions(role);
  return out;
}

export type PermResult = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' };

/** Admin define uma célula da matriz. ADMIN/CEO permanecem sempre liberados. */
export async function setRolePermission(
  user: SessionUser,
  input: { role: Role; module: string; canView: boolean; canEdit: boolean },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<PermResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!ALL_ROLES.includes(input.role) || !MODULES.some((m) => m.key === input.module)) return { ok: false, reason: 'INVALID' };
  if (isFullAccess(input.role)) return { ok: false, reason: 'INVALID' }; // não restringe ADMIN/CEO
  const canView = Boolean(input.canView);
  const canEdit = canView && Boolean(input.canEdit); // sem ver, não edita
  await prisma.rolePermission.upsert({
    where: { role_module: { role: input.role, module: input.module } },
    create: { role: input.role, module: input.module, canView, canEdit },
    update: { canView, canEdit },
  });
  await audit({ userId: user.id, action: 'PERMISSION_SET', module: 'CONFIG', entity: 'role_permission', metadata: { role: input.role, module: input.module, canView, canEdit }, ...ctx });
  return { ok: true };
}
