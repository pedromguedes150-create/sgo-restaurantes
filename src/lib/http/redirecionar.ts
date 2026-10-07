import { NextResponse } from 'next/server';

/**
 * Redirecionamento RELATIVO a partir de uma rota de API (v1.158.1).
 *
 * 🔴 Por que existe: em produção o Next roda em contêiner com `HOSTNAME=0.0.0.0`,
 * e dentro de uma Route Handler o `req.url` chega como `http://0.0.0.0:3100/...`
 * — NÃO é o endereço que o usuário digitou. `NextResponse.redirect(new URL('/x', req.url))`
 * mandava o navegador para `https://0.0.0.0:3100/x`: no celular, "Safari não
 * pode abrir a página (porta de rede restrita)"; no computador, página em branco.
 * Acontecia toda manhã, quando o acesso de 8h expirava e a sessão era renovada
 * pela navegação. Fechar e abrir "resolvia" porque os cookies novos já tinham
 * sido gravados na resposta que o navegador não conseguiu seguir.
 *
 * Um `Location` relativo é HTTP válido (RFC 7231) e o navegador o resolve contra
 * o endereço REAL — não depende de host, proxy nem variável de ambiente.
 */
export function redirecionarRelativo(caminho: string, status: 302 | 303 | 307 | 308 = 307): NextResponse {
  const seguro = caminho.startsWith('/') && !caminho.startsWith('//') ? caminho : '/dashboard';
  return new NextResponse(null, { status, headers: { Location: seguro } });
}
