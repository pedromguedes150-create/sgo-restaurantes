import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { rotateRefresh, requestContext } from '@/lib/auth/service';
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
