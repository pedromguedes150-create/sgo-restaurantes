import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { requestVacation } from '@/lib/people';

/** POST — gerente solicita férias ao RH (item 11, provisório até a API do RH). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.collaboratorId || !b?.startDate || !b?.endDate) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await requestVacation(user, {
    collaboratorId: String(b.collaboratorId), startDate: String(b.startDate), endDate: String(b.endDate), note: b.note,
  }, requestContext(req));
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const msg = r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NOT_FOUND' ? 'Colaborador não encontrado' : 'Período inválido ou já existe férias cruzando essas datas';
    return NextResponse.json({ error: msg }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
