import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createPayout } from '@/lib/people/payouts';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.collaboratorId || !b?.type || !b?.yearMonth) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await createPayout(user, {
    collaboratorId: String(b.collaboratorId), type: b.type, yearMonth: String(b.yearMonth),
    amount: Number(b.amount), note: b.note,
  }, requestContext(req));
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const msg = r.reason === 'FORBIDDEN' ? 'Apenas Supervisão/Admin lançam comissões e mobilidade' : r.reason === 'NOT_FOUND' ? 'Colaborador não encontrado' : 'Dados inválidos';
    return NextResponse.json({ error: msg }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
