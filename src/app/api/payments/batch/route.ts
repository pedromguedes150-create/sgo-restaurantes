import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { approveManyRequests, MAX_BATCH } from '@/lib/payments/approve';

/**
 * Aprovação em lote (Onda 4). Cada item passa pela MESMA checagem de permissão
 * da aprovação individual — o lote não é atalho de autorização. O que falha
 * volta discriminado, para a tela poder dizer o que não passou e por quê.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const body = await req.json().catch(() => ({}));
  if (body?.action !== 'approveMany') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
    return NextResponse.json({ error: 'Informe os IDs a aprovar.' }, { status: 400 });
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json({ error: `Máximo de ${MAX_BATCH} por vez.` }, { status: 400 });
  }

  const result = await approveManyRequests(user, ids as string[], requestContext(req));
  return NextResponse.json({ ok: true, ...result });
}
