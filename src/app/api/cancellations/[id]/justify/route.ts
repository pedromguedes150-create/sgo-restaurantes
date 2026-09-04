import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { reasonResponse } from '@/lib/api/reason';
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
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const body = await req.json().catch(() => null);
  if (!body?.reasonId) return NextResponse.json({ error: 'Selecione o motivo' }, { status: 400 });

  const result = await justifyCancellation(user, params.id, { reasonId: body.reasonId, note: body.note }, requestContext(req));
  if (!result.ok) {
    return reasonResponse(REASONS, result.reason);
  }
  return NextResponse.json({ ok: true });
}
