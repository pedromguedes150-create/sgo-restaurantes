import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';

/**
 * Proteção de rotas no edge. Faz a checagem barata (presença do cookie de
 * acesso). A verificação real de assinatura/escopo acontece sempre no servidor
 * (Server Components / Route Handlers) — regra nº 3.
 *
 * Nota: não verificamos o JWT aqui porque o middleware roda no edge runtime e o
 * `jsonwebtoken` depende de APIs Node; a fonte de verdade é o servidor.
 */
const PUBLIC_PREFIXES = ['/login', '/api/auth', '/api/health'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const hasSession = req.cookies.has(ACCESS_COOKIE);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Aplica a tudo, exceto assets estáticos do Next
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)'],
};
