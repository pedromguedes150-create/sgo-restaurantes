import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { approveRequest, rejectRequest, markPaid, adminEditPayment, adminDeletePayment } from '@/lib/payments/approve';

const MAP: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, INVALID: 400, STATE: 409 };

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const ctx = requestContext(req);

  let result;
  if (action === 'approve') result = await approveRequest(user, params.id, ctx);
  else if (action === 'reject') result = await rejectRequest(user, params.id, body.reason ?? '', ctx);
  else if (action === 'pay') result = await markPaid(user, params.id, ctx);
  else if (action === 'adminEdit') result = await adminEditPayment(user, params.id, { amount: body.amount !== undefined ? Number(body.amount) : undefined, description: body.description }, ctx);
  else if (action === 'adminDelete') result = await adminDeletePayment(user, params.id, ctx);
  else return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  if (!result.ok) return NextResponse.json({ error: 'Operação não permitida', reason: result.reason }, { status: MAP[result.reason] ?? 400 });
  return NextResponse.json({ ok: true });
}
