import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { completeTraining, reopenTraining, type TrainResult } from '@/lib/training';

/** Ações de treinamento: marcar realizado / reabrir. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.action || !b?.recordId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r: TrainResult | undefined;
  if (b.action === 'complete') r = await completeTraining(user, b.recordId, ctx);
  else if (b.action === 'reopen') r = await reopenTraining(user, b.recordId, ctx);

  if (!r) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404 };
    return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Não encontrado', reason: r.reason }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
