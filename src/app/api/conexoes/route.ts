import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { criarConexao, editarConexao, alterarConexao, testarConexao, type EntradaDaConexao } from '@/lib/conexoes/conexoes';

/**
 * Administração das CONEXÕES COM OUTROS SISTEMAS (v1.131.0) — sessão do Admin/CEO.
 * POST { acao: 'criar', ...entrada }                → cria (credencial obrigatória)
 * POST { acao: 'editar', id, ...entrada }           → edita (credencial vazia = manter)
 * POST { acao: 'ativar' | 'desativar', id }
 * POST { acao: 'testar', id, path? }                → testa a conexão gravada
 * POST { acao: 'testar', rascunho: {...entrada} }   → testa antes de salvar
 * A resposta nunca traz a credencial; o teste devolve só status, duração, erro e a forma da resposta.
 */
const STATUS = { FORBIDDEN: 403, INVALID: 400, NOT_FOUND: 404, SEM_CIFRA: 503 } as const;

function entrada(b: Record<string, unknown>): EntradaDaConexao {
  return {
    name: String(b.name ?? ''),
    purpose: b.purpose != null ? String(b.purpose) : null,
    baseUrl: String(b.baseUrl ?? ''),
    authType: (b.authType as EntradaDaConexao['authType']) ?? 'API_KEY_HEADER',
    authHeader: b.authHeader != null ? String(b.authHeader) : null,
    credential: b.credential != null ? String(b.credential) : null,
    testPath: b.testPath != null ? String(b.testPath) : null,
    systemKey: b.systemKey != null ? String(b.systemKey) : null,
  };
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);
  const acao = String(b.acao ?? '');

  if (acao === 'testar') {
    const r = 'rascunho' in b && b.rascunho
      ? await testarConexao(user, { rascunho: entrada(b.rascunho as Record<string, unknown>) }, ctx)
      : await testarConexao(user, { id: String(b.id ?? ''), path: b.path != null ? String(b.path) : null }, ctx);
    if (!r.ok) return NextResponse.json({ error: r.detail ?? 'Não foi possível testar' }, { status: STATUS[r.reason] });
    return NextResponse.json({ ok: true, teste: r.teste });
  }

  let r;
  if (acao === 'criar') r = await criarConexao(user, entrada(b), ctx);
  else if (acao === 'editar') r = await editarConexao(user, String(b.id ?? ''), entrada(b), ctx);
  else if (acao === 'ativar' || acao === 'desativar') r = await alterarConexao(user, String(b.id ?? ''), acao, ctx);
  else return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });

  if (!r.ok) return NextResponse.json({ error: r.detail ?? 'Operação não permitida' }, { status: STATUS[r.reason] });
  return NextResponse.json({ ok: true, id: r.id });
}
