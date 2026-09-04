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

/**
 * Um módulo do sistema. `parent` marca um SUBMENU: uma parte de dentro de outro
 * módulo (uma aba, um bloco), que o Admin pode fechar sem fechar o módulo
 * inteiro — o pedido de "restringir Folgas/férias mas manter Minhas tarefas".
 *
 * Submenu não tem `nav` próprio (vive dentro da tela do pai), então nem a
 * sidebar nem a guarda de rota mudam de comportamento por causa dele.
 * O submenu tem de vir DEPOIS do pai nesta lista — `effectivePermissions`
 * resolve na ordem, e há teste garantindo isso.
 */
export interface ModuleDef { key: string; label: string; nav?: string; parent?: string }

export const MODULES: ModuleDef[] = [
  { key: 'DASHBOARD', label: 'Dashboard', nav: '/dashboard' },

  { key: 'MANAGER_AREA', label: 'Minha área', nav: '/minha-area' },
  { key: 'MANAGER_AREA_TASKS', label: 'Minhas tarefas', parent: 'MANAGER_AREA' },
  { key: 'MANAGER_AREA_NOTES', label: 'Bloco de notas', parent: 'MANAGER_AREA' },
  { key: 'MANAGER_AREA_LEAVES', label: 'Folgas / férias (e meu horário)', parent: 'MANAGER_AREA' },

  { key: 'LEAVES_TEAM', label: 'Consolidado de Folgas/Férias', nav: '/modulos/folgas-equipe' },

  { key: 'TASKS', label: 'Tarefas', nav: '/tarefas' },
  { key: 'TASKS_HISTORY', label: 'Histórico de tarefas', nav: '/tarefas/historico', parent: 'TASKS' },
  { key: 'TASKS_CORRECTIONS', label: 'Correções pendentes', nav: '/tarefas/correcoes', parent: 'TASKS' },
  // Fichas já tinha chave própria (nasce restrita); ganhou o endereço para a
  // guarda de rota bater com a checagem que a tela já fazia sozinha.
  { key: 'CHECKLIST_FORMS', label: 'Fichas (checklists por link)', nav: '/tarefas/fichas', parent: 'TASKS' },

  { key: 'COMMUNICATION', label: 'Central de Comunicação', nav: '/modulos/comunicacao' },
  { key: 'HELP', label: 'Treinamento da Plataforma', nav: '/ajuda' },
  { key: 'WASTE', label: 'Desperdícios', nav: '/modulos/desperdicios' },

  { key: 'OCCURRENCES', label: 'Ocorrências', nav: '/modulos/ocorrencias' },
  { key: 'OCCURRENCES_NEW', label: 'Registrar ocorrência', nav: '/modulos/ocorrencias/nova', parent: 'OCCURRENCES' },

  { key: 'MAINTENANCE', label: 'Manutenção', nav: '/modulos/manutencao' },

  { key: 'COMMANDS', label: 'Comandas', nav: '/modulos/comandas' },
  { key: 'COMMANDS_SCAN', label: 'Conferência por leitor', nav: '/modulos/comandas/conferencia', parent: 'COMMANDS' },
  { key: 'COMMANDS_OPEN', label: 'Análise de comandas em aberto', nav: '/modulos/comandas/analise-aberto', parent: 'COMMANDS' },

  { key: 'CASH', label: 'Gestão de Troco', nav: '/modulos/troco' },
  { key: 'CASH_OFFICE', label: 'Escritório — fila e envios', nav: '/modulos/troco/escritorio', parent: 'CASH' },

  { key: 'CANCELLATIONS', label: 'Cancelamentos', nav: '/modulos/cancelamentos' },
  { key: 'CANCELLATIONS_ITEMS', label: 'Cancelamento de itens', nav: '/modulos/cancelamentos/itens', parent: 'CANCELLATIONS' },
  { key: 'CANCELLATIONS_ANALYSIS', label: 'Análise', nav: '/modulos/cancelamentos/analise', parent: 'CANCELLATIONS' },
  { key: 'CANCELLATIONS_REPORT', label: 'Relatório', nav: '/modulos/cancelamentos/relatorio', parent: 'CANCELLATIONS' },

  { key: 'INVENTORY', label: 'Inventário', nav: '/modulos/inventario' },

  { key: 'NOTES', label: 'Notas Recebidas', nav: '/modulos/notas' },
  { key: 'NOTES_GAS', label: 'Análise de gás', nav: '/modulos/notas/gas', parent: 'NOTES' },

  { key: 'GAS', label: 'Recebimento de Gás', nav: '/modulos/gas' },
  { key: 'GAS_REPORT', label: 'Relatório de gás', nav: '/modulos/gas/relatorio', parent: 'GAS' },

  { key: 'OIL', label: 'Coleta de Óleo', nav: '/modulos/oleo' },

  { key: 'PAYMENTS', label: 'Pagamentos', nav: '/modulos/pagamentos' },
  { key: 'PAYMENTS_FREELANCER_REPORT', label: 'Relatório de freelancers', nav: '/modulos/pagamentos/relatorio-freelancers', parent: 'PAYMENTS' },

  { key: 'PEOPLE', label: 'Pessoas / Escala / Mapa', nav: '/modulos/pessoas' },
  { key: 'PEOPLE_MAP', label: 'Mapa de funções', nav: '/modulos/pessoas/mapa', parent: 'PEOPLE' },
  { key: 'PEOPLE_EVALUATION', label: 'Avaliação do colaborador', nav: '/modulos/pessoas/avaliacao', parent: 'PEOPLE' },
  { key: 'PEOPLE_PAYOUTS', label: 'Comissões e mobilidade', nav: '/modulos/pessoas/comissoes', parent: 'PEOPLE' },
  { key: 'PEOPLE_PROBATION', label: 'Período de experiência', nav: '/modulos/pessoas/experiencia', parent: 'PEOPLE' },
  { key: 'PEOPLE_ROLE_CHANGES', label: 'Mudanças de função', nav: '/modulos/pessoas/mudancas', parent: 'PEOPLE' },
  // A Escala não tinha módulo dono: qualquer usuário logado abria a grade de
  // presença da rede escrevendo o endereço. Entra como parte de Pessoas.
  { key: 'SCHEDULE', label: 'Escala (grade de presença)', nav: '/modulos/escala', parent: 'PEOPLE' },
  { key: 'SCHEDULE_OFF', label: 'Folgas da unidade', nav: '/modulos/escala/folgas', parent: 'SCHEDULE' },
  { key: 'SCHEDULE_SWAPS', label: 'Trocas de plantão', nav: '/modulos/escala/trocas', parent: 'SCHEDULE' },
  { key: 'SCHEDULE_RH_NOTICES', label: 'Avisos ao RH', nav: '/modulos/escala/avisos-rh', parent: 'SCHEDULE' },

  { key: 'CERTIFICATES', label: 'Atestados', nav: '/modulos/atestados' },
  { key: 'CERTIFICATES_REPORT', label: 'Relatório de atestados', nav: '/modulos/atestados/relatorio', parent: 'CERTIFICATES' },

  { key: 'TERMINATIONS', label: 'Desligamentos', nav: '/modulos/desligamentos' },
  { key: 'POPS', label: 'POPs', nav: '/modulos/pops' },
  { key: 'TRAINING', label: 'Treinamentos', nav: '/modulos/treinamentos' },

  { key: 'METAS', label: 'Metas', nav: '/modulos/metas' },
  { key: 'METAS_CONFIG', label: 'Configuração da meta', nav: '/modulos/metas/config', parent: 'METAS' },

  { key: 'SUPERVISION', label: 'Rotina do Supervisor', nav: '/modulos/supervisao' },
  { key: 'EXECUTIVE', label: 'Visão Executiva', nav: '/modulos/executivo' },
  { key: 'UNIT_PANEL', label: 'Painel da unidade', nav: '/modulos/painel-unidade' },

  { key: 'AUDIT', label: 'Auditoria', nav: '/auditoria' },
  { key: 'AUDIT_REPORT', label: 'Relatório de auditoria', nav: '/auditoria/relatorio', parent: 'AUDIT' },

  { key: 'HYGIENE', label: 'Higiene dos banheiros', nav: '/modulos/higiene' },
  { key: 'PRODUCTS', label: 'Solicitação de Produtos', nav: '/modulos/produtos' },

  // Cada tela de Configurações é uma parte própria: dá para liberar uma sem
  // abrir as outras. Todas nascem restritas ao Admin/CEO (ver RESTRICTED_DEFAULT).
  { key: 'CONFIG', label: 'Configurações', nav: '/configuracoes' },
  { key: 'CONFIG_UNITS', label: 'Unidades', nav: '/configuracoes/unidades', parent: 'CONFIG' },
  { key: 'CONFIG_USERS', label: 'Usuários', nav: '/configuracoes/usuarios', parent: 'CONFIG' },
  { key: 'CONFIG_PROFILES', label: 'Perfis de acesso', nav: '/configuracoes/perfis', parent: 'CONFIG' },
  { key: 'CONFIG_CHECKLISTS', label: 'Checklists', nav: '/configuracoes/checklists', parent: 'CONFIG' },
  { key: 'CONFIG_MODELS', label: 'Modelos de checklist', nav: '/configuracoes/modelos', parent: 'CONFIG' },
  { key: 'CONFIG_SUP_CHECKLISTS', label: 'Checklists de visita', nav: '/configuracoes/checklists-supervisor', parent: 'CONFIG' },
  { key: 'CONFIG_COMMANDS', label: 'Comandas (faixas)', nav: '/configuracoes/comandas', parent: 'CONFIG' },
  { key: 'CONFIG_SCHEDULES', label: 'Tipos de escala', nav: '/configuracoes/escalas', parent: 'CONFIG' },
  { key: 'CASH_CONFIG', label: 'Troco (denominações)', nav: '/configuracoes/troco', parent: 'CONFIG' },
  { key: 'CONFIG_WASTE', label: 'Desperdícios (categorias)', nav: '/configuracoes/desperdicios', parent: 'CONFIG' },
  { key: 'CONFIG_OCCURRENCES', label: 'Ocorrências (tipos)', nav: '/configuracoes/ocorrencias', parent: 'CONFIG' },
  { key: 'CONFIG_SUPPLIERS', label: 'Fornecedores', nav: '/configuracoes/fornecedores', parent: 'CONFIG' },
  { key: 'CONFIG_PRODUCTS', label: 'Catálogo de produtos', nav: '/configuracoes/produtos', parent: 'CONFIG' },
  { key: 'CONFIG_PRODUCT_STANDARDS', label: 'Padrão de produtos (foto)', nav: '/configuracoes/padrao-produtos', parent: 'CONFIG' },
  { key: 'CONFIG_PAYMENTS', label: 'Pagamentos (freelancers e avulsos)', nav: '/configuracoes/pagamentos', parent: 'CONFIG' },
  { key: 'CONFIG_FREELANCER_RATES', label: 'Valor do freelancer por setor', nav: '/configuracoes/freelancer-valores', parent: 'CONFIG' },
  { key: 'CONFIG_INTEGRATIONS', label: 'APIs e integrações', nav: '/configuracoes/integracoes', parent: 'CONFIG' },
];

export const ALL_ROLES: Role[] = ['CEO', 'ADMIN', 'SUPERVISOR', 'COORDINATOR', 'MANAGER', 'FINANCE', 'CASHIER'];
export function isFullAccess(role: Role) { return role === 'ADMIN' || role === 'CEO'; }

export interface Perm { canView: boolean; canEdit: boolean }

// Módulos restritos por padrão: só os perfis listados veem se não houver config
// explícita (ADMIN/CEO sempre veem). Admin pode liberar/restringir na matriz.
const RESTRICTED_DEFAULT: Record<string, Role[]> = {
  LEAVES_TEAM: ['SUPERVISOR'],
  SUPERVISION: ['SUPERVISOR'],
  EXECUTIVE: [], // só ADMIN/CEO por padrão (Admin pode liberar na matriz)
  CASH_CONFIG: ['SUPERVISOR', 'COORDINATOR'], // R5: supervisão configura o cofre; Admin/CEO sempre
  CHECKLIST_FORMS: [], // sem papel fixo: só ADMIN/CEO por padrão; o admin libera na matriz (R5)
  // Os três padrões abaixo copiam a regra que a própria tela já aplicava —
  // a guarda de rota passa a dizer a mesma coisa, em vez de deixar abrir e a
  // tela responder "Restrito".
  CONFIG_USERS: ['SUPERVISOR'], // supervisão visualiza o cadastro da rede
  CONFIG_SUPPLIERS: ['SUPERVISOR'], // canManageSuppliers: Admin, CEO e Supervisão
  CONFIG_PRODUCTS: ['SUPERVISOR'], // catálogo: Admin, CEO e Supervisão
  UNIT_PANEL: ['SUPERVISOR', 'COORDINATOR', 'MANAGER'], // painel operacional da unidade
};

/**
 * As telas de Configurações nascem restritas ao Admin/CEO — é o que o hub de
 * Configurações já fazia na mão (`isAdmin`). Sem isto elas herdariam o módulo
 * CONFIG, que é aberto por padrão, e um Gerente passaria a alcançar Unidades,
 * Usuários e Integrações da noite para o dia. Quem tem padrão próprio acima
 * (Troco, Fichas, Usuários) mantém o seu.
 */
for (const m of MODULES) {
  if (m.parent === 'CONFIG' && !(m.key in RESTRICTED_DEFAULT)) RESTRICTED_DEFAULT[m.key] = [];
}

/**
 * Perfis que nascem FECHADOS: em vez de "tudo liberado menos o restrito", só
 * enxergam os módulos listados. O Caixa entra no SGO apenas para bipar comandas
 * na conferência — não deve ver o resto da operação. O Admin ainda pode liberar
 * mais coisas na matriz (a linha cadastrada sempre vence o padrão).
 */
const DEFAULT_ALLOW_ONLY: Partial<Record<Role, string[]>> = {
  CASHIER: ['COMMANDS', 'HELP'],
};

/** Permissões efetivas de um perfil por módulo (com defaults). */
export async function effectivePermissions(role: Role): Promise<Record<string, Perm>> {
  const rows = await prisma.rolePermission.findMany({ where: { role } });
  const byModule = new Map(rows.map((r) => [r.module, r]));
  const out: Record<string, Perm> = {};
  for (const m of MODULES) {
    if (isFullAccess(role)) { out[m.key] = { canView: true, canEdit: true }; continue; }
    const r = byModule.get(m.key);

    if (m.parent) {
      /* Submenu: sem linha cadastrada ele SEGUE o pai — é o que faz esta
         funcionalidade não mudar nada para ninguém enquanto o Admin não mexer.
         Exceção: submenu com padrão PRÓPRIO (as telas de Configurações, o Troco,
         as Fichas) mantém o padrão dele, senão herdar afrouxaria o que já era
         restrito. E o pai é sempre o teto: fechar o módulo fecha as partes,
         mesmo que alguma tenha linha liberando (senão a matriz se contradiria). */
      const pai = out[m.parent] ?? { canView: true, canEdit: true };
      const proprio = RESTRICTED_DEFAULT[m.key];
      const def: Perm = proprio
        ? { canView: proprio.includes(role), canEdit: proprio.includes(role) }
        : pai;
      const canView = (r ? r.canView : def.canView) && pai.canView;
      const canEdit = (r ? r.canEdit : def.canEdit) && canView && pai.canEdit;
      out[m.key] = { canView, canEdit };
      continue;
    }

    const allowOnly = DEFAULT_ALLOW_ONLY[role];
    const restricted = RESTRICTED_DEFAULT[m.key];
    const def = allowOnly ? allowOnly.includes(m.key) : restricted ? restricted.includes(role) : true;
    out[m.key] = { canView: r ? r.canView : def, canEdit: r ? r.canEdit : def };
  }
  return out;
}

/** Este perfil pode EDITAR o módulo? (ADMIN/CEO sempre.) Checagem de servidor. */
export async function canEditModule(role: Role, moduleKey: string): Promise<boolean> {
  if (isFullAccess(role)) return true;
  const perms = await effectivePermissions(role);
  return Boolean(perms[moduleKey]?.canEdit);
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
