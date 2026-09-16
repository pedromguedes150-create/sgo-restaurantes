import { cache } from 'react';
import { cookies } from 'next/headers';
import { verifyAccessToken, type AccessTokenPayload } from '@/lib/auth/jwt';
import { prisma } from '@/lib/db/prisma';
import type { Role } from '@prisma/client';

// Constantes/opções de cookie (definidas em módulo puro p/ edge); importadas
// para uso local e reexportadas por conveniência.
import { ACCESS_COOKIE, REFRESH_COOKIE, authCookieOptions } from '@/lib/auth/cookies';
import { TERMS_VERSION } from '@/lib/lgpd';
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
  /** precisa aceitar o termo LGPD (1º login ou nova versão) */
  needsTerms: boolean;
  /**
   * Perfil personalizado (Gestão de Perfis), se houver. Manda nas permissões de
   * TELA; `role` acima segue valendo para as regras de negócio e é mantido igual
   * ao `baseRole` do perfil.
   *
   * OPCIONAL de propósito: dezenas de testes montam uma sessão falsa com os
   * campos que lhes interessam, e "ausente" aqui significa exatamente o que eles
   * querem dizer — sem perfil personalizado. Obrigar os dois campos custaria
   * editar quarenta arquivos de teste sem mudar comportamento nenhum.
   */
  profileId?: string | null;
  /** Nome do perfil personalizado — é o que a interface mostra no lugar do perfil de sistema. */
  profileName?: string | null;
}

function seesAll(role: Role): boolean {
  return role === 'CEO' || role === 'ADMIN';
}

/**
 * Memoização por request.
 *
 * `cache` só existe no runtime de servidor do React — no Vitest o `react`
 * resolvido é o do cliente e a função vem indefinida. Sem esta guarda, importar
 * qualquer coisa que alcance a sessão quebraria a suíte inteira no import. Fora
 * de um request não há o que memoizar, então a identidade serve.
 */
const memoPorRequest: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof cache === 'function' ? cache : (fn) => fn;

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
 *
 * MEMOIZADO por request (`cache` do React): o layout, a guarda de rota e cada
 * rota de API chamam isto, e a partir da Gestão de Perfis as guardas passaram a
 * consultar a sessão para descobrir o perfil personalizado. Sem a memoização
 * seria uma ida ao banco por chamada, várias por request, para sempre a mesma
 * resposta. A permissão continua refletindo na hora: a memória dura um request.
 */
export const getSessionUser = memoPorRequest(async function getSessionUser(): Promise<SessionUser | null> {
  const payload = readAccessPayload();
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      role: true,
      active: true,
      termsAcceptedAt: true,
      termsVersion: true,
      profileId: true,
      profile: { select: { name: true, active: true, baseRole: true } },
      memberships: { select: { unitId: true } },
    },
  });

  if (!user || !user.active) return null;

  /* Perfil DESATIVADO não vale: o usuário volta ao perfil de sistema dele, em
     vez de ficar com um acesso que o Admin acabou de tirar de circulação. */
  const perfil = user.profile?.active ? user.profile : null;
  const role = perfil?.baseRole ?? user.role;

  return {
    id: user.id,
    name: user.name,
    role,
    unitIds: user.memberships.map((m) => m.unitId),
    seesAllUnits: seesAll(role),
    needsTerms: !user.termsAcceptedAt || user.termsVersion !== TERMS_VERSION,
    profileId: perfil ? user.profileId : null,
    profileName: perfil?.name ?? null,
  };
});
