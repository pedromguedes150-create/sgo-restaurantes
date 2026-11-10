import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { requestContext } from '@/lib/auth/service';
import {
  listarProgramacao, salvarProgramacao, alternarProgramacao, excluirProgramacao, salvarExcecao, excluirExcecao,
} from '@/lib/commands/programacao-dados';

/**
 * Programação das conferências (v1.201.0). A matriz libera a tela
 * (CONFIG_COMMANDS); a lib ainda exige Admin/CEO — é regra de operação da rede.
 */
const STATUS: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, NAO_ENCONTRADA: 404, JA_EXISTE: 409 };
const MSG: Record<string, string> = { FORBIDDEN: 'Restrito ao Administrador', INVALID: 'Dados inválidos', NAO_ENCONTRADA: 'Não encontrado', JA_EXISTE: 'Já existe' };

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  if (user.role !== 'ADMIN' && user.role !== 'CEO') return NextResponse.json({ error: MSG.FORBIDDEN, reason: 'FORBIDDEN' }, { status: 403 });
  const unitId = new URL(req.url).searchParams.get('unitId') ?? '';
  if (!unitId) return NextResponse.json({ error: 'Informe a unidade' }, { status: 400 });
  return NextResponse.json(await listarProgramacao(unitId));
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  try {
    let r;
    if (b.action === 'salvar') r = await salvarProgramacao(user, b, ctx);
    else if (b.action === 'alternar') r = await alternarProgramacao(user, String(b.id ?? ''), Boolean(b.ativa), ctx);
    else if (b.action === 'excluir') r = await excluirProgramacao(user, String(b.id ?? ''), ctx);
    else if (b.action === 'salvarExcecao') r = await salvarExcecao(user, b, ctx);
    else if (b.action === 'excluirExcecao') r = await excluirExcecao(user, String(b.id ?? ''), ctx);
    else return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
    if (!r.ok) return NextResponse.json({ error: r.detalhe ?? MSG[r.reason] ?? 'Não foi possível', reason: r.reason }, { status: STATUS[r.reason] ?? 400 });
    return NextResponse.json({ ...r });
  } catch (e) {
    console.error('[comandas/programacao]', b.action, e);
    return NextResponse.json({ error: 'Falha ao gravar. Tente de novo.', reason: 'ERRO' }, { status: 500 });
  }
}
