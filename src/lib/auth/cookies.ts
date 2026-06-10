/**
 * Constantes e opções de cookie de autenticação.
 * Módulo PURO (sem dependências de Node) para poder ser importado no middleware
 * (edge runtime) sem arrastar `node:crypto`/`jsonwebtoken` para o bundle do edge.
 */
export const ACCESS_COOKIE = 'sgo_access';
export const REFRESH_COOKIE = 'sgo_refresh';

/** Opções padrão de cookie de autenticação (httpOnly, seguro em produção). */
export function authCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}
