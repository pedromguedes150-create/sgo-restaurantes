import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createGasContract, updateGasContract, deleteGasContract } from '@/lib/gas/contracts';

/** POST { action: 'create' | 'update' | 'delete', … } — contratos de gás (16/07). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r;
  if (b.action === 'create') {
    r = await createGasContract(user, {
      unitId: String(b.unitId ?? ''), supplierId: String(b.supplierId ?? ''),
      startDate: String(b.startDate ?? ''), endDate: String(b.endDate ?? ''),
      quantityKg: Number(b.quantityKg), pricePerKg: Number(b.pricePerKg),
      initialUsedKg: b.initialUsedKg !== undefined ? Number(b.initialUsedKg) : undefined,
      note: b.note,
    }, ctx);
  } else if (b.action === 'update') {
    r = await updateGasContract(user, String(b.id ?? ''), {
      startDate: b.startDate, endDate: b.endDate,
      quantityKg: b.quantityKg !== undefined ? Number(b.quantityKg) : undefined,
      pricePerKg: b.pricePerKg !== undefined ? Number(b.pricePerKg) : undefined,
      initialUsedKg: b.initialUsedKg !== undefined ? Number(b.initialUsedKg) : undefined,
      note: b.note, active: b.active,
    }, ctx);
  } else if (b.action === 'delete') {
    r = await deleteGasContract(user, String(b.id ?? ''), ctx);
  } else {
    return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  }

  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const msg = r.reason === 'FORBIDDEN' ? 'Apenas Supervisão/Admin gerenciam contratos' : r.reason === 'NOT_FOUND' ? 'Registro não encontrado' : 'Dados inválidos (período/quantidade/preço)';
    return NextResponse.json({ error: msg }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
