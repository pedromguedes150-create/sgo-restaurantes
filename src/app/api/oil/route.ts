import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createOilCollection } from '@/lib/oil/create';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  INVALID: { msg: 'Informe litros e valor por litro válidos', status: 400 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.unitId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const r = await createOilCollection(user, {
    unitId: b.unitId,
    supplierId: b.supplierId || undefined,
    liters: Number(b.liters),
    pricePerLiter: Number(b.pricePerLiter),
    totalValue: b.totalValue != null ? Number(b.totalValue) : undefined,
    paymentMethod: b.paymentMethod || undefined,
    collectorName: b.collectorName || undefined,
    observation: b.observation || undefined,
  }, requestContext(req));

  if (!r.ok) { const m = REASONS[r.reason]; return NextResponse.json({ error: m.msg, reason: r.reason }, { status: m.status }); }
  return NextResponse.json({ ok: true, id: r.id, totalValue: r.totalValue });
}
