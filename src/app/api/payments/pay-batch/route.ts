import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { payManyRequests, MAX_BATCH } from '@/lib/payments/approve';

/**
 * Marcar como pagas em lote (v1.135.2). Rota PRÓPRIA, e não mais uma ação em
 * `/api/payments/batch`: aquela rota é a aba Aprovar na matriz de perfis, e
 * pagar é a aba Pagar — juntar as duas deixaria quem só aprova pagar pelo lote.
 * Cada item passa pela MESMA checagem da baixa individual (`markPaid`).
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const body = await req.json().catch(() => ({}));
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
    return NextResponse.json({ error: 'Informe os IDs.' }, { status: 400 });
  }
  if (ids.length > MAX_BATCH) return NextResponse.json({ error: `Máximo de ${MAX_BATCH} por vez.` }, { status: 400 });

  const result = await payManyRequests(user, ids as string[], requestContext(req));
  return NextResponse.json({ ok: true, ...result });
}
