import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { addReplacement } from '@/lib/commands/lifecycle';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const body = await req.json().catch(() => null);
  if (!body?.unitId || body.number == null) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const result = await addReplacement(user, body.unitId, Number(body.number), body.note, requestContext(req));
  if (!result.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, NOT_FOUND: 404, CLOSED: 409 };
    return NextResponse.json({ error: 'Não foi possível repor', reason: result.reason }, { status: map[result.reason] ?? 400 });
  }
  return NextResponse.json({ ok: true });
}
