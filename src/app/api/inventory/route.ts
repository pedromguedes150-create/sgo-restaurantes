import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { scheduleInventory } from '@/lib/inventory';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.unitId || !b?.categoryName || !b?.scheduledDate) {
    return NextResponse.json({ error: 'Informe unidade, categoria e data' }, { status: 400 });
  }
  const r = await scheduleInventory(user, { unitId: b.unitId, categoryName: b.categoryName, scheduledDate: b.scheduledDate, responsibleId: b.responsibleId }, requestContext(req));
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, NOT_FOUND: 404, STATE: 409 };
    return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Apenas o Administrador agenda' : 'Dados inválidos', reason: r.reason }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
