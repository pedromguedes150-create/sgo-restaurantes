import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { saveEvaluation, addObservation, listObservations, listEvaluationHistory, evidenciasDoMes } from '@/lib/people/evaluation';

/** GET ?collaboratorId=…&view=observations|history|evidencias(&mes=AAAA-MM) — listas por colaborador. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const url = new URL(req.url);
  const collaboratorId = url.searchParams.get('collaboratorId');
  if (!collaboratorId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const view = url.searchParams.get('view') ?? 'observations';

  if (view === 'history') {
    const history = await listEvaluationHistory(user, collaboratorId);
    return NextResponse.json({ history });
  }
  if (view === 'evidencias') {
    const evidencias = await evidenciasDoMes(user, collaboratorId, url.searchParams.get('mes') ?? '');
    return NextResponse.json({ evidencias });
  }
  const rows = await listObservations(user, collaboratorId);
  return NextResponse.json({
    observations: rows.map((o) => ({ id: o.id, text: o.text, authorName: o.authorName, createdAt: o.createdAt.toISOString() })),
  });
}

const MENSAGEM: Record<string, string> = {
  FORBIDDEN: 'Sem permissão',
  NOT_FOUND: 'Colaborador não encontrado',
  INVALID: 'Dados inválidos',
  SEM_MODELO: 'Função sem modelo de avaliação. Peça ao Administrador para vincular o cargo em Configurações → Avaliação por função.',
  GERENCIAL: 'Função gerencial: quem avalia é a Supervisão.',
  PROPRIO: 'Você não avalia a si próprio.',
};
const STATUS: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400, SEM_MODELO: 409, GERENCIAL: 403, PROPRIO: 403 };

/** POST { action: 'evaluate' | 'observe', … } — evaluate traz `respostas: [{ key, score|null, justification }]`. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const b = await req.json().catch(() => null);
  if (!b?.action || !b?.collaboratorId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r;
  if (b.action === 'evaluate') {
    const respostas = Array.isArray(b.respostas)
      ? b.respostas.map((x: { key?: unknown; score?: unknown; justification?: unknown }) => ({
          key: String(x?.key ?? ''),
          score: x?.score === null ? null : (x?.score === undefined ? undefined : Number(x.score)),
          justification: x?.justification == null ? null : String(x.justification),
        }))
      : [];
    r = await saveEvaluation(user, String(b.collaboratorId), String(b.yearMonth ?? ''), { respostas, comments: b.comments == null ? undefined : String(b.comments) }, ctx);
  } else if (b.action === 'observe') {
    r = await addObservation(user, String(b.collaboratorId), String(b.text ?? ''), ctx);
  } else {
    return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  }

  if (!r.ok) {
    const erros = 'erros' in r ? r.erros : undefined;
    return NextResponse.json({ error: erros?.length ? erros.join(' ') : (MENSAGEM[r.reason] ?? 'Falha'), erros, reason: r.reason }, { status: STATUS[r.reason] ?? 400 });
  }
  return NextResponse.json({ ok: true });
}
