import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { saveEvaluation, addObservation, listObservations, listEvaluationHistory } from '@/lib/people/evaluation';

/** GET ?collaboratorId=…&view=observations|history — listas por colaborador. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const url = new URL(req.url);
  const collaboratorId = url.searchParams.get('collaboratorId');
  if (!collaboratorId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const view = url.searchParams.get('view') ?? 'observations';

  if (view === 'history') {
    const rows = await listEvaluationHistory(user, collaboratorId);
    return NextResponse.json({
      history: rows.map((e) => ({
        yearMonth: e.yearMonth, punctuality: e.punctuality, performance: e.performance,
        teamwork: e.teamwork, presentation: e.presentation, comments: e.comments, evaluatorName: e.evaluatorName,
      })),
    });
  }
  const rows = await listObservations(user, collaboratorId);
  return NextResponse.json({
    observations: rows.map((o) => ({ id: o.id, text: o.text, authorName: o.authorName, createdAt: o.createdAt.toISOString() })),
  });
}

/** POST { action: 'evaluate' | 'observe', … } */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.action || !b?.collaboratorId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r;
  if (b.action === 'evaluate') {
    r = await saveEvaluation(user, String(b.collaboratorId), String(b.yearMonth ?? ''), {
      punctuality: b.punctuality, performance: b.performance, teamwork: b.teamwork, presentation: b.presentation, comments: b.comments,
    }, ctx);
  } else if (b.action === 'observe') {
    r = await addObservation(user, String(b.collaboratorId), String(b.text ?? ''), ctx);
  } else {
    return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  }

  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const msg = r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NOT_FOUND' ? 'Colaborador não encontrado' : 'Dados inválidos';
    return NextResponse.json({ error: msg }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
