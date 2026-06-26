import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createSector, updateSector, toggleSector, deleteSector, createShift, updateShift, deleteShift, allocate, updateAllocation, removeAllocation, type WfResult } from '@/lib/workforce';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r: WfResult | undefined;
  if (b.action === 'createSector') r = await createSector(user, b, ctx);
  else if (b.action === 'updateSector') r = await updateSector(user, b.id, b, ctx);
  else if (b.action === 'toggleSector') r = await toggleSector(user, b.id, b.active, ctx);
  else if (b.action === 'deleteSector') r = await deleteSector(user, b.id, ctx);
  else if (b.action === 'createShift') r = await createShift(user, b, ctx);
  else if (b.action === 'updateShift') r = await updateShift(user, b.id, b, ctx);
  else if (b.action === 'deleteShift') r = await deleteShift(user, b.id, ctx);
  else if (b.action === 'allocate') r = await allocate(user, b, ctx);
  else if (b.action === 'updateAllocation') r = await updateAllocation(user, b.id, b, ctx);
  else if (b.action === 'removeAllocation') r = await removeAllocation(user, b.id, ctx);

  if (!r) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, NOT_FOUND: 404 };
    const fallback = r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NOT_FOUND' ? 'Registro não encontrado' : 'Dados inválidos';
    return NextResponse.json({ error: ('detail' in r && r.detail) ? r.detail : fallback, reason: r.reason }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
