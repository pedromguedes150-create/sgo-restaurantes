import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { closeOccurrence } from '@/lib/occurrences/close';

const REASONS: Record<string, { msg: string; status: number }> = {
  NOT_FOUND: { msg: 'Ocorrência não encontrada', status: 404 },
  FORBIDDEN: { msg: 'Apenas Supervisor/Admin podem encerrar', status: 403 },
  INVALID: { msg: 'Justificativa, ação corretiva e data de revisão são obrigatórias', status: 400 },
  ALREADY_CLOSED: { msg: 'Ocorrência já encerrada', status: 409 },
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const reviewDate = body.reviewDate ? new Date(body.reviewDate) : null;
  if (!reviewDate || Number.isNaN(reviewDate.getTime())) {
    return NextResponse.json({ error: REASONS.INVALID.msg }, { status: 400 });
  }

  const result = await closeOccurrence(
    user,
    params.id,
    { justification: body.justification, correctiveAction: body.correctiveAction, reviewDate },
    requestContext(req),
  );

  if (!result.ok) {
    const r = REASONS[result.reason];
    return NextResponse.json({ error: r.msg, reason: result.reason }, { status: r.status });
  }
  return NextResponse.json({ ok: true });
}
