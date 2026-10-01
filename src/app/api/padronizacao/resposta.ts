import { NextResponse } from 'next/server';
import type { EscritaResult } from '@/lib/preparo/write';

const STATUS: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, NOT_FOUND: 404, CODIGO_EXISTE: 409, STATE: 409 };

/** Uma resposta só para as quatro rotas de escrita — mesmo formato, mesmos códigos. */
export function respostaDaEscrita(r: EscritaResult) {
  if (r.ok) return NextResponse.json({ ok: true, id: r.id, mudancas: r.mudancas ?? null });
  return NextResponse.json(
    { error: r.message, reason: r.reason, campo: r.campo ?? null, existente: r.existente ?? null },
    { status: STATUS[r.reason] ?? 400 },
  );
}
