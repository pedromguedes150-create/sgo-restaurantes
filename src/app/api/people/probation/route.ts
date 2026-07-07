import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { reviewProbation } from '@/lib/people/probation';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.collaboratorId || !b?.status) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await reviewProbation(user, String(b.collaboratorId), { status: b.status, notes: b.notes }, requestContext(req));
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NOT_FOUND' ? 'Colaborador não encontrado' : 'Dados inválidos' }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
