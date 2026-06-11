import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { setInvestigating, closeDivergence } from '@/lib/commands/lifecycle';

const REASONS: Record<string, { msg: string; status: number }> = {
  NOT_FOUND: { msg: 'Divergência não encontrada', status: 404 },
  FORBIDDEN: { msg: 'Sem permissão', status: 403 },
  INVALID: { msg: 'Ação inválida', status: 400 },
  CLOSED: { msg: 'Divergência já encerrada', status: 409 },
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action;
  const ctx = requestContext(req);

  let result;
  if (action === 'investigate') {
    result = await setInvestigating(user, params.id, ctx);
  } else if (action === 'close') {
    result = await closeDivergence(user, params.id, body.outcome, ctx);
  } else {
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  }

  if (!result.ok) {
    const r = REASONS[result.reason];
    return NextResponse.json({ error: r.msg, reason: result.reason }, { status: r.status });
  }
  return NextResponse.json({ ok: true });
}
