import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { recusaDeAba } from '@/lib/permissions/guarda-abas';
import { approveRequest, rejectRequest, markPaid, adminEditPayment, adminDeletePayment, approverEditRequest } from '@/lib/payments/approve';

const MAP: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, INVALID: 400, STATE: 409 };

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const ctx = requestContext(req);

  /* Aba fechada na matriz de perfis não grava: "Aprovar" manda em approve/reject/
     approverEdit, "Pagar" em pay (auditoria 04/09 — antes só sumia o botão). */
  const negado = await recusaDeAba(user.role, 'PAYMENTS', String(action ?? ''));
  if (negado) return negado;

  let result;
  if (action === 'approve') result = await approveRequest(user, params.id, ctx);
  else if (action === 'approverEdit') result = await approverEditRequest(user, params.id, {
    amount: body.amount !== undefined ? Number(body.amount) : undefined,
    description: typeof body.description === 'string' ? body.description : undefined,
    workDate: typeof body.workDate === 'string' ? body.workDate : undefined,
    workStartTime: body.workStartTime === null ? null : typeof body.workStartTime === 'string' ? body.workStartTime : undefined,
    workEndTime: body.workEndTime === null ? null : typeof body.workEndTime === 'string' ? body.workEndTime : undefined,
    workSectorId: typeof body.workSectorId === 'string' ? body.workSectorId : undefined,
    transportValue: body.transportValue === null ? null : body.transportValue !== undefined ? Number(body.transportValue) : undefined,
    collaboratorName: typeof body.collaboratorName === 'string' ? body.collaboratorName : undefined,
    hours: body.hours === null ? null : body.hours !== undefined ? Number(body.hours) : undefined,
    reason: typeof body.reason === 'string' ? body.reason : undefined,
    beneficiary: typeof body.beneficiary === 'string' ? body.beneficiary : undefined,
  }, ctx);
  else if (action === 'reject') result = await rejectRequest(user, params.id, body.reason ?? '', ctx);
  else if (action === 'pay') result = await markPaid(user, params.id, ctx);
  else if (action === 'adminEdit') result = await adminEditPayment(user, params.id, { amount: body.amount !== undefined ? Number(body.amount) : undefined, description: body.description }, ctx);
  else if (action === 'adminDelete') result = await adminDeletePayment(user, params.id, ctx);
  else return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  if (!result.ok) return NextResponse.json({ error: result.detail ?? 'Operação não permitida', reason: result.reason }, { status: MAP[result.reason] ?? 400 });
  return NextResponse.json({ ok: true });
}
