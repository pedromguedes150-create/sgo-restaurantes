import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createTicket, advanceTicket, updateTicket } from '@/lib/maintenance';

function mapErr(reason?: string) {
  const status = reason === 'FORBIDDEN' ? 403 : reason === 'NOT_FOUND' ? 404 : 400;
  const error = reason === 'FORBIDDEN' ? 'Sem acesso' : reason === 'NOT_FOUND' ? 'Chamado não encontrado' : 'Dados inválidos';
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.unitId || !b?.title) return NextResponse.json({ error: 'Informe unidade e título' }, { status: 400 });
  const r = await createTicket(user, {
    unitId: String(b.unitId), title: String(b.title), description: b.description ? String(b.description) : undefined,
    equipmentId: b.equipmentId || undefined, supplierId: b.supplierId || undefined,
    deadline: b.deadline || undefined, occurrenceId: b.occurrenceId || undefined,
  }, requestContext(req));
  if (!r.ok) return mapErr(r.reason);
  return NextResponse.json({ ok: true, id: r.id });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);
  let r;
  if (b.action && ['start', 'done', 'cancel', 'reopen'].includes(b.action)) {
    r = await advanceTicket(user, String(b.id), b.action, { cost: b.cost != null ? Number(b.cost) : undefined, resolutionNote: b.resolutionNote }, ctx);
  } else {
    r = await updateTicket(user, String(b.id), {
      title: b.title, description: b.description,
      supplierId: b.supplierId, deadline: b.deadline,
      cost: b.cost != null ? Number(b.cost) : undefined,
    }, ctx);
  }
  if (!r.ok) return mapErr(r.reason);
  return NextResponse.json({ ok: true });
}
