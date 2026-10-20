import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { definirFuncoesDaCozinha, setPercentuais } from '@/lib/comissao/config';

/** Configuração da Comissão: percentuais (só Admin) e funções da cozinha (Admin/CEO/Coordenador). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const barrado = await guardaDaRota(user.role, req);
  if (barrado) return barrado;

  const b = await req.json().catch(() => ({}));
  const ctx = requestContext(req);
  const acao = String(b?.acao ?? '');
  const r = acao === 'percentuais'
    ? await setPercentuais(user, { vendedor: Number(b?.vendedor), cozinha: Number(b?.cozinha) }, ctx)
    : acao === 'funcoes'
      ? await definirFuncoesDaCozinha(user, Array.isArray(b?.jobTitles) ? b.jobTitles.map(String) : [], ctx)
      : ({ ok: false, reason: 'INVALID', message: 'Ação desconhecida.' } as const);
  if (!r.ok) return NextResponse.json({ error: r.message ?? (r.reason === 'FORBIDDEN' ? 'Sem permissão.' : 'Dados inválidos.'), reason: r.reason }, { status: r.reason === 'FORBIDDEN' ? 403 : 400 });
  return NextResponse.json({ ok: true });
}
