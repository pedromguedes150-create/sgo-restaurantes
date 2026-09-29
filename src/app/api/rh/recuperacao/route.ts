import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { reativarInativadosPorAusencia } from '@/lib/rh/recuperacao';

/**
 * Recuperação dos inativados por ausência (v1.132.1) — só Admin.
 * POST { unitId, ids: string[] } → reativa só quem o RH diz que trabalha.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.unitId || !Array.isArray(b.ids)) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await reativarInativadosPorAusencia(user, String(b.unitId), b.ids.map(String), requestContext(req));
  if (!r.ok) {
    const map = { FORBIDDEN: 403, NOT_FOUND: 404, RH_ERROR: 502, INVALID: 400 } as const;
    return NextResponse.json({ error: r.detail ?? 'Operação não permitida' }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, reativados: r.reativados, ignorados: r.ignorados, nomes: r.nomes });
}
