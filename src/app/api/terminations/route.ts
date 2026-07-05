import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createTermination, decideTermination, getTerminationContext } from '@/lib/terminations';
import type { NoticeType } from '@prisma/client';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  if (b.action === 'context') {
    if (!b.collaboratorId) return NextResponse.json({ error: 'Colaborador inválido' }, { status: 400 });
    const c = await getTerminationContext(user, b.collaboratorId);
    return c ? NextResponse.json(c) : NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  let r;
  if (b.action === 'create') {
    r = await createTermination(user, { unitId: b.unitId, collaboratorId: b.collaboratorId, noticeType: b.noticeType as NoticeType, noticeJustification: b.noticeJustification, reason: b.reason, ageYears: b.ageYears != null ? Number(b.ageYears) : undefined }, ctx);
  } else if (b.action === 'decide') {
    r = await decideTermination(user, b.id, Boolean(b.approve), b.rejectionReason, ctx);
  }
  if (!r) return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, NOT_FOUND: 404 };
    return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NOT_FOUND' ? 'Não encontrado' : 'Dados inválidos', reason: r.reason }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
