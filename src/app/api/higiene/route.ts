import { NextResponse } from 'next/server';
import { createHygieneRequest } from '@/lib/hygiene';

/** Pública (QR do banheiro) — registra solicitação de higienização e notifica o gerente. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b?.unitId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await createHygieneRequest({
    unitId: String(b.unitId), locationId: b.locationId ? String(b.locationId) : null,
    issue: b.issue ?? null, rating: b.rating != null ? Number(b.rating) : null, comment: b.comment ?? null,
  });
  if (!r.ok) return NextResponse.json({ error: 'Não foi possível registrar' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
