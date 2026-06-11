import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { justifyCancellation } from '@/lib/cancellations/justify';

const REASONS: Record<string, { msg: string; status: number }> = {
  NOT_FOUND: { msg: 'Cancelamento não encontrado', status: 404 },
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  INVALID: { msg: 'Motivo inválido', status: 400 },
  ALREADY: { msg: 'Já justificado', status: 409 },
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.reasonId) return NextResponse.json({ error: 'Selecione o motivo' }, { status: 400 });

  const result = await justifyCancellation(user, params.id, { reasonId: body.reasonId, note: body.note }, requestContext(req));
  if (!result.ok) {
    const r = REASONS[result.reason];
    return NextResponse.json({ error: r.msg, reason: result.reason }, { status: r.status });
  }
  return NextResponse.json({ ok: true });
}
