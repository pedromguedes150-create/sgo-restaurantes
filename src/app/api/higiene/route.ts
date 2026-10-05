import { NextResponse } from 'next/server';
import { avaliarHygieneRequest, createHygieneRequest } from '@/lib/hygiene';

/**
 * Pública (QR do banheiro) — registra o aviso e dispara o alerta do gerente.
 * `acao: 'avaliar'` grava a nota opcional depois do envio (uma vez, na 1ª hora).
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (b?.acao === 'avaliar') {
    const r = await avaliarHygieneRequest(String(b.id ?? ''), Number(b.rating));
    return NextResponse.json({ ok: r.ok }, { status: r.ok ? 200 : 400 });
  }
  if (!b?.unitId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await createHygieneRequest({
    unitId: String(b.unitId), locationId: b.locationId ? String(b.locationId) : null,
    issue: b.issue ?? null, rating: b.rating != null ? Number(b.rating) : null, comment: b.comment ?? null,
  });
  if (!r.ok) return NextResponse.json({ error: 'Não foi possível registrar' }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id, repetido: r.repetido });
}
