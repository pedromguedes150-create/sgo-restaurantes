import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { registerVariation } from '@/lib/people';
import type { ScheduleVariation } from '@prisma/client';

const VALID = ['NONE', 'ABSENCE', 'LATE', 'SWAP'];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!VALID.includes(b.variation)) return NextResponse.json({ error: 'Variação inválida' }, { status: 400 });
  const r = await registerVariation(user, params.id, b.variation as ScheduleVariation, b.note, requestContext(req));
  if (!r.ok) {
    const map: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, INVALID: 400 };
    return NextResponse.json({ error: 'Falha', reason: r.reason }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
