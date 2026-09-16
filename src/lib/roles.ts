import type { Role } from '@prisma/client';

/** Rótulos PT-BR dos perfis (regra nº 2 — interface 100% em português). */
export const ROLE_LABELS: Record<Role, string> = {
  CEO: 'CEO / Diretoria',
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  COORDINATOR: 'Coordenador',
  MANAGER: 'Gerente',
  FINANCE: 'Financeiro',
  CASHIER: 'Caixa',
  SEPARATOR: 'Separador CD',
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * Linha de apoio dos perfis que existem para UMA tarefa só.
 *
 * Mora aqui, e não colado ao rótulo entre parênteses, porque o rótulo também
 * vira crachá e cabeçalho — "Caixa (só conferência de comandas)" num crachá
 * fica ilegível. O Select do design system tem campo `hint` próprio.
 */
export const ROLE_HINTS: Partial<Record<Role, string>> = {
  CASHIER: 'Login só para a conferência de comandas',
  SEPARATOR: 'Login só para a separação de pedidos do setor dele',
};

/**
 * "Supervisores" na linguagem do Pedro = SUPERVISOR + COORDINATOR + ADMIN.
 * Regra permanente (23/07/2026): toda vez que o pedido citar supervisor,
 * supervisores, coordenador ou administrador, o item vale para estes três perfis.
 * CEO enxerga tudo pela visão total; não é alvo explícito salvo pedido do Pedro.
 */
export const SUPERVISORY_ROLES: Role[] = ['SUPERVISOR', 'COORDINATOR', 'ADMIN'];

export function isSupervisory(role: Role): boolean {
  return SUPERVISORY_ROLES.includes(role);
}
