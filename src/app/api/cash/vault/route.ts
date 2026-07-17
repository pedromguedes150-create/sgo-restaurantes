import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { countVault, refillBucket, officeSwap, vaultWithdrawal, upsertBucket, toggleBucket } from '@/lib/cash-vault';

/** POST { action, … } — Cofre de troco v2 (16/07). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r;
  if (b.action === 'count') r = await countVault(user, String(b.unitId ?? ''), b.balances ?? {}, b.note, ctx);
  else if (b.action === 'refill') r = await refillBucket(user, String(b.unitId ?? ''), String(b.bucketId ?? ''), b.outSmall ?? {}, b.inBig ?? {}, b.note, ctx);
  else if (b.action === 'officeSwap') r = await officeSwap(user, String(b.unitId ?? ''), b.outBig ?? {}, b.inSmall ?? {}, b.note, ctx);
  else if (b.action === 'withdrawal') r = await vaultWithdrawal(user, String(b.unitId ?? ''), b.amounts ?? {}, String(b.reason ?? ''), ctx);
  else if (b.action === 'bucketSet') r = await upsertBucket(user, { id: b.id ? String(b.id) : undefined, unitId: String(b.unitId ?? ''), name: String(b.name ?? ''), targetValue: Number(b.targetValue) }, ctx);
  else if (b.action === 'bucketToggle') r = await toggleBucket(user, String(b.id ?? ''), Boolean(b.active), ctx);
  else return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });

  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const fallback = r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NOT_FOUND' ? 'Registro não encontrado' : 'Dados inválidos';
    return NextResponse.json({ error: ('detail' in r && r.detail) || fallback }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
