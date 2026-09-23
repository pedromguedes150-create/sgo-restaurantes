import { type NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getEvolucaoDaRede, getBreakdownComparacao } from '@/lib/metas/consolidado';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const guard = await guardaDaRota(user.role, req);
  if (guard) return guard;

  const sp = req.nextUrl.searchParams;
  const action = sp.get('action');
  const month = /^\d{4}-\d{2}$/.test(sp.get('month') ?? '') ? sp.get('month')! : new Date().toISOString().slice(0, 7);

  if (action === 'evolucao') {
    const raw = sp.get('meses') ?? '3';
    const meses = (['3', '6', '12'].includes(raw) ? Number(raw) : 3) as 3 | 6 | 12;
    const data = await getEvolucaoDaRede(user, month, meses);
    return NextResponse.json(data);
  }

  if (action === 'comparacao') {
    const unitIds = (sp.get('unitIds') ?? '').split(',').filter(Boolean).slice(0, 3);
    if (unitIds.length === 0) return NextResponse.json([]);
    const data = await getBreakdownComparacao(unitIds, month);
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'action inválido' }, { status: 400 });
}
