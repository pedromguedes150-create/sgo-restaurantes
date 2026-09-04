import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { getUpcomingDues } from '@/lib/notes/due';

export const dynamic = 'force-dynamic';

/** GET ?unitId=&supplier=&dias=&vencidos= — acompanhamento de vencimentos das notas/gás. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const sp = new URL(req.url).searchParams;
  const dias = Number(sp.get('dias'));
  const rows = await getUpcomingDues(user, {
    unitId: sp.get('unitId') || undefined,
    supplierName: sp.get('supplier') || undefined,
    daysAhead: Number.isFinite(dias) && dias > 0 ? dias : 30,
    includeOverdue: sp.get('vencidos') === '1',
  });
  return NextResponse.json({ rows });
}
