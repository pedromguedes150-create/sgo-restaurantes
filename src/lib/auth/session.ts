import { cookies } from 'next/headers';
import { verifyAccessToken, type AccessTokenPayload } from '@/lib/auth/jwt';
import { prisma } from '@/lib/db/prisma';
import type { Role } from '@prisma/client';

// Constantes/opções de cookie (definidas em módulo puro p/ edge); importadas
// para uso local e reexportadas por conveniência.
import { ACCESS_COOKIE, REFRESH_COOKIE, authCookieOptions } from '@/lib/auth/cookies';
export { ACCESS_COOKIE, REFRESH_COOKIE, authCookieOptions };

/** Usuário autenticado resolvido a partir do access token (cookie httpOnly). */
export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  /** unidades às quais o usuário tem vínculo (vazio para CEO/ADMIN, que veem tudo) */
  unitIds: string[];
  /** true para CEO/ADMIN — enxergam todas as unidades */
  seesAllUnits: boolean;
}

function seesAll(role: Role): boolean {
  return role === 'CEO' || role === 'ADMIN';
}

/** Lê e valida o access token do cookie. Retorna o payload ou null. */
export function readAccessPayload(): AccessTokenPayload | null {
  const token = cookies().get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

/**
 * Carrega o usuário da sessão com seus vínculos de unidade.
 * Use em Server Components / Route Handlers. Retorna null se não autenticado.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const payload = readAccessPayload();
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      role: true,
      active: true,
      memberships: { select: { unitId: true } },
    },
  });

  if (!user || !user.active) return null;

  return {
    id: user.id,
    name: user.name,
    role: user.role,
    unitIds: user.memberships.map((m) => m.unitId),
    seesAllUnits: seesAll(user.role),
  };
}
