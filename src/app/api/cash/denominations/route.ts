import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import {
  listUnitDenominations, saveDenomination, reorderDenominations, copyDenominationsToMyUnits,
} from '@/lib/cash-denominations';

const errMap: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
function fail(reason: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID', detail?: string) {
  const fb = reason === 'FORBIDDEN' ? 'Sem permissão' : reason === 'NOT_FOUND' ? 'Registro não encontrado' : 'Dados inválidos';
  return NextResponse.json({ error: detail || fb }, { status: errMap[reason] });
}

/** GET ?unitId= — denominações da unidade (config). Só quem tem CASH_CONFIG + escopo. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const unitId = new URL(req.url).searchParams.get('unitId') ?? '';
  if (!unitId) return fail('INVALID', 'Informe a unidade.');
  const data = await listUnitDenominations(user, unitId);
  if (!data) return fail('FORBIDDEN');
  return NextResponse.json(data);
}

/** POST { action: 'save' | 'reorder' | 'copyToAll', unitId, … } */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.action || !b?.unitId) return fail('INVALID', 'Requisição inválida.');
  const ctx = requestContext(req);
  const unitId = String(b.unitId);

  if (b.action === 'save') {
    const r = await saveDenomination(user, unitId, {
      key: String(b.key ?? ''),
      active: typeof b.active === 'boolean' ? b.active : undefined,
      isSmall: typeof b.isSmall === 'boolean' ? b.isSmall : undefined,
      isBig: typeof b.isBig === 'boolean' ? b.isBig : undefined,
      countsAsBigIndicator: typeof b.countsAsBigIndicator === 'boolean' ? b.countsAsBigIndicator : undefined,
    }, ctx);
    return r.ok ? NextResponse.json({ ok: true }) : fail(r.reason, r.detail);
  }
  if (b.action === 'reorder') {
    const keys = Array.isArray(b.orderedKeys) ? b.orderedKeys.map(String) : [];
    const r = await reorderDenominations(user, unitId, keys, ctx);
    return r.ok ? NextResponse.json({ ok: true }) : fail(r.reason, r.detail);
  }
  if (b.action === 'copyToAll') {
    const r = await copyDenominationsToMyUnits(user, unitId, ctx);
    return r.ok ? NextResponse.json({ ok: true, result: r.result }) : fail(r.reason, r.detail);
  }
  return fail('INVALID', 'Ação desconhecida.');
}
