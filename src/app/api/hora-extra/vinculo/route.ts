import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { vincularAutomaticamente, vincularManual } from '@/lib/hora-extra/vinculo';

/**
 * Vínculo da hora extra antiga com o colaborador do RH (v1.142.0).
 * `auto` liga só o que bate com UM colaborador; `manual` é a escolha do Admin.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const b = await req.json().catch(() => null);
  const ctx = requestContext(req);
  if (b?.action === 'auto') {
    const r = await vincularAutomaticamente(user, ctx);
    return NextResponse.json({ ok: true, ...r });
  }
  if (b?.action === 'manual') {
    if (typeof b.id !== 'string' || typeof b.collaboratorId !== 'string') return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    const r = await vincularManual(user, b.id, b.collaboratorId, ctx);
    if (!r.ok) {
      const map = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400, STATE: 409 } as const;
      return NextResponse.json({ error: r.detail ?? (r.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Não foi possível vincular.') }, { status: map[r.reason] });
    }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}
