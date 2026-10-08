import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { solicitarRevisao } from '@/lib/people/pdi';

/** POST { evaluationId, reason } — a Supervisão pede revisão de uma avaliação (v1.162.0). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const b = await req.json().catch(() => null);
  if (!b?.evaluationId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await solicitarRevisao(user, String(b.evaluationId), String(b.reason ?? ''), requestContext(req));
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400, JA_ABERTA: 409 };
    return NextResponse.json({ error: r.detalhe ?? (r.reason === 'FORBIDDEN' ? 'Só a Supervisão pede revisão.' : r.reason === 'NOT_FOUND' ? 'Avaliação não encontrada' : 'Dados inválidos') }, { status: map[r.reason] ?? 400 });
  }
  return NextResponse.json(r);
}
