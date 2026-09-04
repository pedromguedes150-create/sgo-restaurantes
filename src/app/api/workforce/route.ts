import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createSector, updateSector, toggleSector, deleteSector, createShift, updateShift, deleteShift, allocate, updateAllocation, removeAllocation, assignFreelancerSector, saveSimulation, type WfResult } from '@/lib/workforce';
import { requestFunctionChange } from '@/lib/people/role-change';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
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
  else if (b.action === 'assignFreelancerSector') r = await assignFreelancerSector(user, b.requestId, b.sectorId ?? null, ctx);
  else if (b.action === 'changeFunction') r = await requestFunctionChange(user, String(b.collaboratorId ?? ''), String(b.newTitle ?? ''), ctx);
  else if (b.action === 'saveSimulation') r = await saveSimulation(user, String(b.unitId ?? ''), String(b.date ?? ''), Array.isArray(b.assignments) ? b.assignments : [], b.note, ctx);

  if (!r) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, NOT_FOUND: 404 };
    const fallback = r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NOT_FOUND' ? 'Registro não encontrado' : 'Dados inválidos';
    return NextResponse.json({ error: ('detail' in r && r.detail) ? r.detail : fallback, reason: r.reason }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
