import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { reenviar } from '@/lib/rh/saida/fila';
import { despacharPendentes } from '@/lib/rh/saida/despachante';

const REASONS = {
  FORBIDDEN: { msg: 'Só o Administrador opera a fila de envios ao RH', status: 403 },
  NOT_FOUND: { msg: 'Evento não encontrado', status: 404 },
  INVALID: { msg: 'Este evento não pode ser reenviado (já foi enviado ou está em envio)', status: 400 },
};

/**
 * Fila de saída SGO→RH (v1.168.0), tela do Admin:
 *  - reenviar  → remonta do cadastro atual e devolve à fila (mesmo sgoEventId)
 *  - despachar → roda o despachante agora (o mesmo do scheduler), para testar
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  if (user.role !== 'ADMIN' && user.role !== 'CEO') return NextResponse.json({ error: REASONS.FORBIDDEN.msg }, { status: 403 });
  const b = await req.json().catch(() => null);
  const acao = String(b?.acao ?? '');

  if (acao === 'reenviar') {
    const r = await reenviar(user, String(b?.id ?? ''), requestContext(req));
    if (!r.ok) return reasonResponse(REASONS, r.reason);
    return NextResponse.json({ ok: true, status: r.status });
  }
  if (acao === 'despachar') {
    const r = await despacharPendentes({ limite: 50 });
    return NextResponse.json({ ok: true, ...r });
  }
  return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
}
