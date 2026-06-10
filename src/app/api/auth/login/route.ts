import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate, requestContext } from '@/lib/auth/service';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authCookieOptions,
} from '@/lib/auth/session';

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const ctx = requestContext(req);
  const session = await authenticate(parsed.data.email, parsed.data.password, ctx);

  if (!session) {
    // Mensagem genérica — não revela se o e-mail existe
    return NextResponse.json({ error: 'E-mail ou senha incorretos' }, { status: 401 });
  }

  const res = NextResponse.json({ user: session.user });
  res.cookies.set(ACCESS_COOKIE, session.accessToken, authCookieOptions(session.accessMaxAgeMs));
  res.cookies.set(REFRESH_COOKIE, session.refreshToken, authCookieOptions(session.refreshMaxAgeMs));
  return res;
}
