import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { approveManyRequests, rejectManyRequests, MAX_BATCH } from '@/lib/payments/approve';

/**
 * Aprovação — e, desde 04/09, reprovação — em lote (Onda 4). Cada item passa
 * pela MESMA checagem de permissão da ação individual — o lote não é atalho de
 * autorização. O que falha volta discriminado, para a tela poder dizer o que
 * não passou e por quê.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== 'approveMany' && action !== 'rejectMany') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
    return NextResponse.json({ error: 'Informe os IDs.' }, { status: 400 });
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json({ error: `Máximo de ${MAX_BATCH} por vez.` }, { status: 400 });
  }

  if (action === 'rejectMany') {
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) return NextResponse.json({ error: 'Informe o motivo da reprovação.' }, { status: 400 });
    const result = await rejectManyRequests(user, ids as string[], reason, requestContext(req));
    return NextResponse.json({ ok: true, ...result });
  }

  const result = await approveManyRequests(user, ids as string[], requestContext(req));
  return NextResponse.json({ ok: true, ...result });
}
