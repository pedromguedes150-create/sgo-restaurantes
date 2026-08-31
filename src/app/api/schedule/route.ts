import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { saveSchedulePattern, deleteSchedulePattern, setActual, clearActual, fillActualFromPlan, type SchedResult } from '@/lib/schedule';
import { salvarEscalaDoColaborador, encerrarEscala } from '@/lib/schedule/employee';
import { migrarEscalasLegadas } from '@/lib/schedule/migrate';
import { salvarFolgasEmLote } from '@/lib/schedule/folgas-lote';

/** Ações JSON da Escala (cadastro de padrão e edição do Realizado). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  const ctx = requestContext(req);

  if (b.action === 'saveFolgasLote') {
    const res = await salvarFolgasEmLote(user, { unitId: String(b.unitId ?? ''), startDate: String(b.startDate ?? ''), itens: b.itens ?? [] }, ctx);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.message ?? (res.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Dados inválidos'), reason: res.reason },
        { status: res.reason === 'FORBIDDEN' ? 403 : 400 },
      );
    }
    return NextResponse.json({ ok: true, ...res.resultado });
  }

  if (b.action === 'migrateLegacy') {
    const res = await migrarEscalasLegadas(user, { unitId: b.unitId ? String(b.unitId) : undefined, aPartirDe: String(b.aPartirDe ?? '') }, ctx);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.message ?? (res.reason === 'FORBIDDEN' ? 'Apenas o Administrador' : 'Dados inválidos'), reason: res.reason },
        { status: res.reason === 'FORBIDDEN' ? 403 : 400 },
      );
    }
    return NextResponse.json({ ok: true, ...res.resultado });
  }

  /* A escala com VIGÊNCIA responde antes: ela tem mensagem própria, e a
     genérica ("Dados inválidos") esconderia justamente o que falta preencher. */
  if (b.action === 'saveEmployeeSchedule' || b.action === 'endEmployeeSchedule') {
    const res = b.action === 'saveEmployeeSchedule'
      ? await salvarEscalaDoColaborador(user, b, ctx)
      : await encerrarEscala(user, String(b.collaboratorId ?? ''), String(b.unitId ?? ''), String(b.lastDay ?? ''), ctx);
    if (!res.ok) {
      return NextResponse.json(
        { error: res.message ?? (res.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Dados inválidos'), reason: res.reason },
        { status: res.reason === 'FORBIDDEN' ? 403 : 400 },
      );
    }
    return NextResponse.json({ ok: true, id: res.id, substituiu: res.substituiu });
  }

  let r: SchedResult | undefined;
  if (b.action === 'savePattern') r = await saveSchedulePattern(user, b, ctx);
  else if (b.action === 'deletePattern') r = await deleteSchedulePattern(user, b.collaboratorId, b.unitId, ctx);
  else if (b.action === 'setActual') r = await setActual(user, b, ctx);
  else if (b.action === 'clearActual') r = await clearActual(user, b.collaboratorId, b.unitId, b.date, ctx);
  else if (b.action === 'fill') r = await fillActualFromPlan(user, b, ctx);

  if (!r) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, NOT_FOUND: 404 };
    return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NOT_FOUND' ? 'Não encontrado' : 'Dados inválidos', reason: r.reason }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, ...(('id' in r && r.id) ? { id: r.id } : {}) });
}
