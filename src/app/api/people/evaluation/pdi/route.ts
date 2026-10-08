import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { criarPlano, atualizarPlano, listarPlanos } from '@/lib/people/pdi';

/** GET ?collaboratorId=… — planos de desenvolvimento do colaborador (com a situação derivada). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const collaboratorId = new URL(req.url).searchParams.get('collaboratorId');
  if (!collaboratorId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  return NextResponse.json({ planos: await listarPlanos(user, collaboratorId) });
}

/**
 * POST { acao: 'criar' | 'atualizar', … }
 *  - criar:     { collaboratorId, evaluationId?, yearMonth, criterionKey?, criterionLabel, action, responsibleId?, responsibleName?, dueDate, note? }
 *  - atualizar: { id, status?, note?, action?, dueDate? }
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const b = await req.json().catch(() => null);
  if (!b?.acao) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);
  const s = (v: unknown) => (v == null ? undefined : String(v));

  let r;
  if (b.acao === 'criar') {
    r = await criarPlano(user, {
      collaboratorId: String(b.collaboratorId ?? ''), evaluationId: s(b.evaluationId) ?? null, yearMonth: String(b.yearMonth ?? ''),
      criterionKey: s(b.criterionKey) ?? null, criterionLabel: String(b.criterionLabel ?? ''), action: String(b.action ?? ''),
      responsibleId: s(b.responsibleId) ?? null, responsibleName: s(b.responsibleName), dueDate: String(b.dueDate ?? ''), note: s(b.note),
    }, ctx);
  } else if (b.acao === 'atualizar') {
    r = await atualizarPlano(user, String(b.id ?? ''), { status: s(b.status) as 'PENDING' | 'IN_PROGRESS' | 'DONE' | undefined, note: s(b.note), action: s(b.action), dueDate: s(b.dueDate) }, ctx);
  } else {
    return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  }
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400, JA_ABERTA: 409 };
    return NextResponse.json({ error: r.detalhe ?? (r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NOT_FOUND' ? 'Não encontrado' : 'Dados inválidos') }, { status: map[r.reason] ?? 400 });
  }
  return NextResponse.json(r);
}
