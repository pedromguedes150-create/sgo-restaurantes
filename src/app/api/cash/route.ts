import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { openCashSession, closeCashSession } from '@/lib/cash';

/** POST { action: 'open' | 'close', … } — Gestão de Troco (Módulo 16). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r;
  if (b.action === 'open') r = await openCashSession(user, String(b.unitId ?? ''), Number(b.amount), b.note, ctx);
  else if (b.action === 'close') r = await closeCashSession(user, String(b.id ?? ''), Number(b.amount), b.note, ctx);
  else return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });

  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const fallback = r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NOT_FOUND' ? 'Registro não encontrado' : 'Dados inválidos';
    return NextResponse.json({ error: ('detail' in r && r.detail) || fallback }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
