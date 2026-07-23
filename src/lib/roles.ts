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
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

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
