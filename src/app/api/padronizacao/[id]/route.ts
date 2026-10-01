import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { updatePrepStandard, setPrepStandardStatus } from '@/lib/preparo/write';
import { getPrepStandard } from '@/lib/preparo/query';
import { respostaDaEscrita } from '../resposta';

/**
 * A ficha em JSON — usada pela comparação ANTES → NOVO quando uma importação
 * cai num código que já existe. Fica sob a regra `editar` do prefixo (é o
 * Admin que importa); a consulta operacional é a página, não esta rota.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const ficha = await getPrepStandard(user, params.id);
  if (!ficha) return NextResponse.json({ error: 'Ficha não encontrada.' }, { status: 404 });
  return NextResponse.json({ ok: true, ficha });
}

/** Editar a ficha (`action:'update'`, com `dados`) ou mudar a situação (`action:'status'`). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const b = await req.json().catch(() => null) as { action?: string; dados?: unknown; status?: string } | null;
  if (!b) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  if (b.action === 'update') return respostaDaEscrita(await updatePrepStandard(user, params.id, b.dados, ctx));
  if (b.action === 'status') {
    const status = b.status === 'ACTIVE' || b.status === 'INACTIVE' ? b.status : null;
    if (!status) return NextResponse.json({ error: 'Situação inválida.' }, { status: 400 });
    return respostaDaEscrita(await setPrepStandardStatus(user, params.id, status, ctx));
  }
  return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
}
