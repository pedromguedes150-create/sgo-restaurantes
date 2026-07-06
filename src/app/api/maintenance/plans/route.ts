import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createPlan, updatePlan, registerPlanExecution } from '@/lib/maintenance';

function mapErr(reason?: string) {
  const status = reason === 'FORBIDDEN' ? 403 : reason === 'NOT_FOUND' ? 404 : 400;
  const error = reason === 'FORBIDDEN' ? 'Sem acesso' : reason === 'NOT_FOUND' ? 'Plano não encontrado' : 'Dados inválidos';
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.unitId || !b?.title || !b?.frequencyDays) return NextResponse.json({ error: 'Informe unidade, título e frequência' }, { status: 400 });
  const r = await createPlan(user, {
    unitId: String(b.unitId), title: String(b.title), description: b.description ? String(b.description) : undefined,
    equipmentId: b.equipmentId || undefined, frequencyDays: Number(b.frequencyDays), firstDueAt: b.firstDueAt || undefined,
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
  if (b.action === 'execute') {
    r = await registerPlanExecution(user, String(b.id), b.note ? String(b.note) : undefined, ctx);
  } else {
    r = await updatePlan(user, String(b.id), {
      title: b.title, description: b.description,
      frequencyDays: b.frequencyDays != null ? Number(b.frequencyDays) : undefined,
      active: typeof b.active === 'boolean' ? b.active : undefined,
      nextDueAt: b.nextDueAt,
    }, ctx);
  }
  if (!r.ok) return mapErr(r.reason);
  return NextResponse.json({ ok: true });
}
