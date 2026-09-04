import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { requestVacationChange } from '@/lib/people';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => ({}));
  const r = await requestVacationChange(user, params.id, b.note ?? '', requestContext(req));
  if (!r.ok) {
    const map: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, INVALID: 400 };
    return NextResponse.json({ error: r.reason === 'INVALID' ? 'Descreva a alteração' : 'Falha', reason: r.reason }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
