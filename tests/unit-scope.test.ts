import { describe, it, expect } from 'vitest';
import {
  unitScopeWhere,
  canAccessUnit,
  assertUnitAccess,
  UnitScopeError,
} from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';

const ceo: SessionUser = { id: 'u1', name: 'CEO', role: 'CEO', unitIds: [], seesAllUnits: true, needsTerms: false };
const admin: SessionUser = { id: 'u2', name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false };
const manager: SessionUser = {
  id: 'u3',
  name: 'Gerente',
  role: 'MANAGER',
  unitIds: ['unitA', 'unitB'],
  seesAllUnits: false,
  needsTerms: false,
};

describe('escopo por unidade (regra nº 3 — sempre no servidor)', () => {
  it('CEO/ADMIN não recebem filtro (veem todas)', () => {
    expect(unitScopeWhere(ceo)).toEqual({});
    expect(unitScopeWhere(admin)).toEqual({});
  });

  it('gerente recebe filtro restrito às suas unidades', () => {
    expect(unitScopeWhere(manager)).toEqual({ unitId: { in: ['unitA', 'unitB'] } });
  });

  it('respeita coluna customizada (ex: id em Unit)', () => {
    expect(unitScopeWhere(manager, 'id')).toEqual({ id: { in: ['unitA', 'unitB'] } });
  });

  it('canAccessUnit valida pertencimento', () => {
    expect(canAccessUnit(manager, 'unitA')).toBe(true);
    expect(canAccessUnit(manager, 'unitZ')).toBe(false);
    expect(canAccessUnit(ceo, 'qualquer')).toBe(true);
  });

  it('assertUnitAccess lança para unidade fora do escopo', () => {
    expect(() => assertUnitAccess(manager, 'unitZ')).toThrow(UnitScopeError);
    expect(() => assertUnitAccess(manager, 'unitA')).not.toThrow();
  });
});
