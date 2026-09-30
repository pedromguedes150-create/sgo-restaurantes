import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { registerRefund } from '@/lib/expenses/refund';

const MAP: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, STATE: 409 };
const MSG: Record<string, string> = {
  NOT_FOUND: 'Despesa não encontrada.',
  FORBIDDEN: 'Só o escritório (Coordenação, Supervisão, Financeiro ou Admin) registra a devolução.',
  STATE: 'Esta despesa já foi devolvida ou cancelada.',
};

/** Ações sobre uma despesa. Hoje só `refund`; cancelar entra aqui quando existir (com motivo). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const body = await req.json().catch(() => ({}));
  if (body?.action !== 'refund') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  const r = await registerRefund(user, params.id, requestContext(req));
  if (!r.ok) return NextResponse.json({ error: MSG[r.reason], reason: r.reason }, { status: MAP[r.reason] ?? 400 });
  return NextResponse.json({ ok: true });
}
