import type { Role } from '@prisma/client';

/** Rótulos PT-BR dos perfis (regra nº 2 — interface 100% em português). */
export const ROLE_LABELS: Record<Role, string> = {
  CEO: 'CEO / Diretoria',
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  COORDINATOR: 'Coordenador',
  MANAGER: 'Gerente',
  FINANCE: 'Financeiro',
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}
