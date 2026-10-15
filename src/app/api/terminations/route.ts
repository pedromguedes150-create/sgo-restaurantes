import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { recusaDeAba } from '@/lib/permissions/guarda-abas';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createTermination, decideTermination, getTerminationContext } from '@/lib/terminations';

const REASONS = {
  FORBIDDEN: { msg: 'Sem permissão', status: 403 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
  NOT_FOUND: { msg: 'Não encontrado', status: 404 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const b = await req.json().catch(() => null);
  /* Aba fechada na matriz de perfis não grava — esconder o botão é
     conveniência, recusar aqui é o controle. */
  const negado = b?.action ? await recusaDeAba(user.role, 'TERMINATIONS', String(b.action)) : null;
  if (negado) return negado;
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  if (b.action === 'context') {
    if (!b.collaboratorId) return NextResponse.json({ error: 'Colaborador inválido' }, { status: 400 });
    const c = await getTerminationContext(user, b.collaboratorId);
    return c ? NextResponse.json(c) : NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  let r;
  if (b.action === 'create') {
    /* v1.168.0: os campos do contrato do GBF-RH (tipo, modalidade do aviso,
       motivo, data, carta). `reason` segue como texto livre. */
    r = await createTermination(user, {
      unitId: String(b.unitId ?? ''), collaboratorId: String(b.collaboratorId ?? ''),
      terminationKind: String(b.terminationKind ?? ''), noticeMode: b.noticeMode ? String(b.noticeMode) : null,
      reasonCode: String(b.reasonCode ?? ''), terminationDate: String(b.terminationDate ?? ''),
      reason: String(b.reason ?? ''), letterPath: b.letterPath ? String(b.letterPath) : null,
      noticeJustification: b.noticeJustification ? String(b.noticeJustification) : undefined,
      ageYears: b.ageYears != null && b.ageYears !== '' ? Number(b.ageYears) : undefined,
    }, ctx);
  } else if (b.action === 'decide') {
    r = await decideTermination(user, b.id, Boolean(b.approve), b.rejectionReason, ctx);
  }
  if (!r) return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  if (!r.ok) return reasonResponse(REASONS, r.reason, r.message);
  return NextResponse.json({ ok: true, id: r.id });
}
