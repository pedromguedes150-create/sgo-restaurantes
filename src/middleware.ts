import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/cookies';

/**
 * Proteção de rotas no edge. Faz a checagem barata (presença do cookie de
 * acesso). A verificação real de assinatura/escopo acontece sempre no servidor
 * (Server Components / Route Handlers) — regra nº 3.
 *
 * Nota: não verificamos o JWT aqui porque o middleware roda no edge runtime e o
 * `jsonwebtoken` depende de APIs Node; a fonte de verdade é o servidor.
 */
// /api/integracoes = recepção máquina-a-máquina (RH→SGO), autenticada por
// token Bearer DENTRO da rota (RH_INBOUND_TOKEN) — sem cookie de sessão.
// '/checklists' e '/api/checklists/public' = fichas preenchidas por link, SEM login
// (a config em /configuracoes/fichas e a API /api/checklist-forms seguem protegidas).
// '/dev' = páginas de referência do design system (dev-only; cada página faz
// notFound() em produção, então liberá-las do login não expõe nada em prod).
const PUBLIC_PREFIXES = ['/login', '/api/auth', '/api/health', '/api/integracoes', '/higiene', '/api/higiene', '/checklists', '/api/checklists/public', '/dev'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const hasAccess = req.cookies.has(ACCESS_COOKIE);
  if (!hasAccess) {
    // Access token expirou. Se ainda há refresh válido (30 dias) e é uma
    // navegação (documento), renova de forma transparente em vez de deslogar.
    const hasRefresh = req.cookies.has(REFRESH_COOKIE);
    const isDocNav = req.method === 'GET' && !pathname.startsWith('/api');
    if (hasRefresh && isDocNav) {
      const url = req.nextUrl.clone();
      url.pathname = '/api/auth/refresh';
      url.search = '';
      url.searchParams.set('redirect', pathname + (req.nextUrl.search || ''));
      return NextResponse.redirect(url);
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }

  /* Entrega o caminho ao servidor: componentes de servidor não recebem o
     pathname, e a guarda de módulo do layout precisa dele. */
  const headers = new Headers(req.headers);
  headers.set('x-sgo-path', pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Aplica a tudo, exceto assets estáticos do Next
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)'],
};
