import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { editEntryDate, type LateEntryModule } from '@/lib/late-entry';

/** POST { module: 'payment'|'note'|'gas'|'oil', id, date } — Admin/Supervisor. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.module || !b?.id || !b?.date) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await editEntryDate(user, b.module as LateEntryModule, String(b.id), String(b.date), requestContext(req));
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const msg = r.reason === 'FORBIDDEN' ? 'Apenas Admin/Supervisor editam a data' : r.reason === 'NOT_FOUND' ? 'Lançamento não encontrado' : 'Data inválida (não pode ser futura)';
    return NextResponse.json({ error: msg }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
