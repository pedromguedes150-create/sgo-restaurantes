import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { definirTokenDeEntrada, removerTokenDeEntrada } from '@/lib/rh/inbound-token';

/**
 * Token de ENTRADA do RH pela tela (v1.183.0) — sessão do Admin/CEO.
 * POST { acao: 'definirToken', token } | { acao: 'removerToken' }
 * (A porta que o RH usa é /api/integracoes/rh/[evento]; esta rota só grava o token.)
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  const acao = String(b?.acao ?? '');

  if (acao === 'definirToken') {
    const r = await definirTokenDeEntrada(user, String(b?.token ?? ''), requestContext(req));
    if (!r.ok) return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Só o Administrador grava o token do RH' : (r.message ?? 'Token inválido') }, { status: r.reason === 'FORBIDDEN' ? 403 : 400 });
    return NextResponse.json({ ok: true, mascarado: r.mascarado });
  }
  if (acao === 'removerToken') {
    const r = await removerTokenDeEntrada(user, requestContext(req));
    if (!r.ok) return NextResponse.json({ error: 'Só o Administrador remove o token do RH' }, { status: 403 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}
