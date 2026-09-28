import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { alterarChave, criarChave, type AcaoNaChave } from '@/lib/api-global/chaves';

/**
 * Administração das chaves da API Global (v1.129.0) — sessão do Admin/CEO.
 * POST  { name, description? }        → cria o sistema e devolve a chave UMA vez
 * PATCH { id, acao: ativar|desativar|revogar }
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  const r = await criarChave(user, { name: String(b?.name ?? ''), description: b?.description ? String(b.description) : null }, requestContext(req));
  if (!r.ok) return NextResponse.json({ error: r.detail ?? 'Sem permissão' }, { status: r.reason === 'FORBIDDEN' ? 403 : 400 });
  return NextResponse.json({ ok: true, id: r.id, chave: r.chave });
}

const ACOES: readonly AcaoNaChave[] = ['ativar', 'desativar', 'revogar'];

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.id || !ACOES.includes(b.acao)) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await alterarChave(user, String(b.id), b.acao as AcaoNaChave, requestContext(req));
  if (!r.ok) {
    const map = { FORBIDDEN: 403, NOT_FOUND: 404, STATE: 409 } as const;
    return NextResponse.json({ error: r.detail ?? 'Operação não permitida' }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
