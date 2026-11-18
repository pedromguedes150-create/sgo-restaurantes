import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { ativarCargo, criarCargo, renomearCargo, type ResultadoDoCargo } from '@/lib/curriculos/cargos';

/** Configurações → Currículos: a lista de cargos do encaminhamento (Admin/CEO). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  const ctx = requestContext(req);
  let r: ResultadoDoCargo;
  if (b?.acao === 'criar') r = await criarCargo(user, String(b.nome ?? ''), ctx);
  else if (b?.acao === 'renomear') r = await renomearCargo(user, String(b.id ?? ''), String(b.nome ?? ''), ctx);
  else if (b?.acao === 'ativar') r = await ativarCargo(user, String(b.id ?? ''), Boolean(b.active), ctx);
  else return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  if (!r.ok) {
    const status = r.reason === 'FORBIDDEN' ? 403 : r.reason === 'NOT_FOUND' ? 404 : 400;
    return NextResponse.json({ error: r.message ?? (r.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Não encontrado') }, { status });
  }
  return NextResponse.json({ ok: true, id: r.id ?? null });
}
