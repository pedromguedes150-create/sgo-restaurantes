import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { getVaultHistory, type VaultHistoryFilters } from '@/lib/cash-vault';
import type { CashMovementType } from '@prisma/client';

export const dynamic = 'force-dynamic';

/** GET ?unitId=&types=&userId=&from=&to=&minValue=&maxValue=&sort= — histórico do cofre. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const sp = new URL(req.url).searchParams;
  const unitId = sp.get('unitId') ?? '';
  if (!unitId) return NextResponse.json({ error: 'Unidade não informada' }, { status: 400 });

  const num = (v: string | null) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const f: VaultHistoryFilters = {
    types: (sp.get('types') || '').split(',').filter(Boolean) as CashMovementType[],
    userId: sp.get('userId') || undefined,
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
    minValue: num(sp.get('minValue')),
    maxValue: num(sp.get('maxValue')),
    sort: (sp.get('sort') as VaultHistoryFilters['sort']) || 'date_desc',
  };
  if (f.types && f.types.length === 0) delete f.types;

  const result = await getVaultHistory(user, unitId, f);
  if (!result) return NextResponse.json({ error: 'Sem acesso a esta unidade' }, { status: 403 });
  return NextResponse.json(result);
}
