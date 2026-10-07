import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { rotateRefresh, requestContext } from '@/lib/auth/service';
import { redirecionarRelativo } from '@/lib/http/redirecionar';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authCookieOptions,
} from '@/lib/auth/session';

/** Rotaciona a sessão a partir do refresh token (cookie httpOnly). */
export async function POST(req: Request) {
  const oldToken = cookies().get(REFRESH_COOKIE)?.value;
  if (!oldToken) {
    return NextResponse.json({ error: 'Sessão expirada' }, { status: 401 });
  }

  const session = await rotateRefresh(oldToken, requestContext(req));
  if (!session) {
    const res = NextResponse.json({ error: 'Sessão expirada' }, { status: 401 });
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    return res;
  }

  const res = NextResponse.json({ user: session.user });
  res.cookies.set(ACCESS_COOKIE, session.accessToken, authCookieOptions(session.accessMaxAgeMs));
  res.cookies.set(REFRESH_COOKIE, session.refreshToken, authCookieOptions(session.refreshMaxAgeMs));
  return res;
}

/**
 * Renovação transparente via navegação (usada pelo middleware quando o access
 * token expirou mas o refresh ainda é válido): rotaciona e redireciona de volta
 * para a rota pedida, mantendo o usuário logado (refresh dura 30 dias).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  let redirect = url.searchParams.get('redirect') || '/dashboard';
  if (!redirect.startsWith('/') || redirect.startsWith('//')) redirect = '/dashboard';
  /* Location RELATIVO (v1.158.1): em produção req.url chega como http://0.0.0.0:3100
     (HOSTNAME do contêiner) — montar a URL de destino a partir dele mandava o
     usuário para 0.0.0.0 toda manhã. Ver src/lib/http/redirecionar.ts. */
  const oldToken = cookies().get(REFRESH_COOKIE)?.value;
  if (!oldToken) return redirecionarRelativo('/login');

  const session = await rotateRefresh(oldToken, requestContext(req));
  if (!session) {
    const res = redirecionarRelativo('/login');
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    return res;
  }
  const res = redirecionarRelativo(redirect);
  res.cookies.set(ACCESS_COOKIE, session.accessToken, authCookieOptions(session.accessMaxAgeMs));
  res.cookies.set(REFRESH_COOKIE, session.refreshToken, authCookieOptions(session.refreshMaxAgeMs));
  return res;
}
