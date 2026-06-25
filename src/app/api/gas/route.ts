import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createGasReceipt } from '@/lib/gas/create';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  INVALID: { msg: 'Informe quantidade (kg) e valor total válidos', status: 400 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.unitId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const r = await createGasReceipt(user, {
    unitId: b.unitId,
    supplierId: b.supplierId || undefined,
    quantityKg: Number(b.quantityKg),
    pricePerKg: b.pricePerKg != null ? Number(b.pricePerKg) : undefined,
    totalValue: b.totalValue != null ? Number(b.totalValue) : undefined,
    operationalDate: b.operationalDate || undefined,
    accessKey: b.accessKey || undefined,
    noteNumber: b.noteNumber || undefined,
    observation: b.observation || undefined,
  }, requestContext(req));

  if (!r.ok) {
    const m = REASONS[r.reason];
    return NextResponse.json({ error: m.msg, reason: r.reason }, { status: m.status });
  }
  return NextResponse.json({ ok: true, id: r.id, pricePerKg: r.pricePerKg, variationPct: r.variationPct, alerted: r.alerted });
}
