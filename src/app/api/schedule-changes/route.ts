import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createScheduleChange } from '@/lib/schedule-changes';

/** POST — registra troca de escala (item 15) e avisa os Admins → RH. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.unitId || !b?.collaboratorAId || !b?.dateA) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await createScheduleChange(user, {
    unitId: String(b.unitId), collaboratorAId: String(b.collaboratorAId), dateA: String(b.dateA),
    collaboratorBId: b.collaboratorBId ? String(b.collaboratorBId) : undefined,
    dateB: b.dateB ? String(b.dateB) : undefined,
    reason: b.reason,
  }, requestContext(req));
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const msg = r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NOT_FOUND' ? 'Colaborador não encontrado na unidade' : 'Informe com quem ou para qual dia é a troca';
    return NextResponse.json({ error: msg }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
