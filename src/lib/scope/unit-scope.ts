import type { SessionUser } from '@/lib/auth/session';

/**
 * ESCOPO POR UNIDADE (regra inegociável nº 3).
 *
 * O escopo é aplicado SEMPRE no servidor, nunca apenas no front. Estas funções
 * traduzem a sessão do usuário em um filtro de `unitId` que deve ser injetado em
 * TODA consulta a dados de unidade.
 *
 * - CEO / ADMIN: enxergam todas as unidades (sem filtro).
 * - Demais perfis: somente as unidades às quais têm vínculo.
 */

/**
 * Filtro Prisma de unidade para o usuário.
 * - retorna {} (sem restrição) para quem vê tudo;
 * - retorna { unitId: { in: [...] } } para os demais.
 *
 * @param column nome do campo de unidade no modelo (padrão "unitId")
 */
export function unitScopeWhere(
  user: SessionUser,
  column: string = 'unitId',
): Record<string, unknown> {
  if (user.seesAllUnits) return {};
  return { [column]: { in: user.unitIds } };
}

/** O usuário pode acessar dados desta unidade específica? */
export function canAccessUnit(user: SessionUser, unitId: string): boolean {
  if (user.seesAllUnits) return true;
  return user.unitIds.includes(unitId);
}

/**
 * Garante acesso à unidade ou lança. Use no início de handlers que recebem unitId.
 */
export function assertUnitAccess(user: SessionUser, unitId: string): void {
  if (!canAccessUnit(user, unitId)) {
    throw new UnitScopeError(unitId);
  }
}

export class UnitScopeError extends Error {
  readonly unitId: string;
  constructor(unitId: string) {
    super(`Acesso negado à unidade ${unitId}`);
    this.name = 'UnitScopeError';
    this.unitId = unitId;
  }
}
