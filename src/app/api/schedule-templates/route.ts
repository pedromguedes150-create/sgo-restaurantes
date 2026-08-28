import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { upsertScheduleTemplate, toggleScheduleTemplate, deleteScheduleTemplate, type TemplateResult } from '@/lib/schedule/templates';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, DUPLICATE: 409, IN_USE: 409 };
const GENERICO: Record<string, string> = {
  FORBIDDEN: 'Apenas o Administrador',
  INVALID: 'Dados inválidos',
  DUPLICATE: 'Já existe um registro com esses dados',
  IN_USE: 'Em uso — inative em vez de excluir',
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  const ctx = requestContext(req);

  let r: TemplateResult | null = null;
  if (b.action === 'upsert') {
    r = await upsertScheduleTemplate(user, {
      id: b.id ? String(b.id) : undefined,
      name: String(b.name ?? ''),
      workDays: Number(b.workDays),
      offDays: Number(b.offDays),
      startTime: b.startTime ?? null,
      breakTime: b.breakTime ?? null,
      endTime: b.endTime ?? null,
    }, ctx);
  } else if (b.action === 'toggle') {
    r = await toggleScheduleTemplate(user, String(b.id ?? ''), Boolean(b.active));
  } else if (b.action === 'delete') {
    r = await deleteScheduleTemplate(user, String(b.id ?? ''));
  }

  if (!r) return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  if (!r.ok) {
    /* A mensagem do caso vence a genérica: "ciclo sem folga marcaria o mês
       inteiro como trabalho" resolve; "Dados inválidos" só informa que deu
       errado. */
    return NextResponse.json({ error: r.message ?? GENERICO[r.reason] ?? 'Falha', reason: r.reason }, { status: STATUS[r.reason] ?? 400 });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
