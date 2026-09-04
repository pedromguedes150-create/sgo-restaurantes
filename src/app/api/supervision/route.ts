import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { recusaDeAba } from '@/lib/permissions/guarda-abas';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { scheduleVisit, completeVisit, cancelVisit } from '@/lib/supervisor/visits';
import { setVisitPlan } from '@/lib/supervisor/visit-plans';

/** POST { action: 'schedule' | 'complete' | 'cancel', … } — Rotina do Supervisor. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const b = await req.json().catch(() => null);
  /* Aba fechada na matriz de perfis não grava — esconder o botão é
     conveniência, recusar aqui é o controle. */
  const negado = b?.action ? await recusaDeAba(user.role, 'SUPERVISION', String(b.action)) : null;
  if (negado) return negado;
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r;
  if (b.action === 'schedule') r = await scheduleVisit(user, { unitId: String(b.unitId ?? ''), scheduledDate: String(b.scheduledDate ?? '') }, ctx);
  else if (b.action === 'complete') r = await completeVisit(user, String(b.id ?? ''), { feedback: String(b.feedback ?? ''), checklistId: b.checklistId ? String(b.checklistId) : undefined, results: Array.isArray(b.results) ? b.results : undefined }, ctx);
  else if (b.action === 'cancel') r = await cancelVisit(user, String(b.id ?? ''), ctx);
  else if (b.action === 'setPlan') r = await setVisitPlan(user, String(b.unitId ?? ''), Number(b.frequencyDays), ctx);
  else return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });

  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const fallback = r.reason === 'FORBIDDEN' ? 'Apenas Supervisão/Admin' : r.reason === 'NOT_FOUND' ? 'Registro não encontrado' : 'Dados inválidos';
    return NextResponse.json({ error: ('detail' in r && r.detail) || fallback }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
