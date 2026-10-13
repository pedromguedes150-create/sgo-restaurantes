import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { adicionarRazaoSocial, conferenciaDasRazoes, removerRazaoSocial } from '@/lib/rh/razoes';
import { MENSAGEM_DA_RECUSA } from '@/lib/rh/razoes-calculo';

/**
 * Razões sociais do RH por unidade (v1.166.0).
 * GET  → conferência de TODAS as razões sociais do RH × unidades do SGO.
 * POST → { acao: 'adicionar', unitId, criterio: 'CNPJ'|'NOME', valor } | { acao: 'remover', id }.
 * As regras (só ADMIN, critério conferido contra o RH) moram em `lib/rh/razoes`.
 */
const MENSAGENS: Record<string, string> = {
  ...MENSAGEM_DA_RECUSA,
  FORBIDDEN: 'Restrito ao Administrador.',
  NOT_FOUND: 'Não encontrado.',
  NOT_CONFIGURED: 'A integração com o RH não está configurada neste servidor.',
  SEM_PRINCIPAL: 'Defina primeiro o "Nome no RH" principal desta unidade.',
  JA_E_A_PRINCIPAL: 'Essa já é a razão social principal desta unidade.',
  RH_ERROR: 'Não foi possível consultar o RH agora. Nada foi alterado.',
};

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const r = await conferenciaDasRazoes(user);
  if (!r.ok) return NextResponse.json({ error: MENSAGENS[r.reason] ?? r.reason, detalhe: r.message }, { status: r.reason === 'FORBIDDEN' ? 403 : 502 });
  return NextResponse.json(r.conferencia);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  const ctx = requestContext(req);
  if (b?.acao === 'remover' && typeof b.id === 'string') {
    const r = await removerRazaoSocial(user, b.id, ctx);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: MENSAGENS[r.reason] }, { status: r.reason === 'FORBIDDEN' ? 403 : 404 });
  }
  if (b?.acao === 'adicionar' && typeof b.unitId === 'string') {
    const r = await adicionarRazaoSocial(user, b.unitId, b.criterio, String(b.valor ?? ''), ctx);
    if (r.ok) return NextResponse.json(r);
    const msg = r.reason === 'JA_VINCULADA' && 'unidade' in r ? `Essa razão social já é lida pela unidade ${r.unidade}. Uma razão social pertence a uma unidade só.` : MENSAGENS[r.reason] ?? r.reason;
    const candidatos = 'candidatos' in r ? r.candidatos : undefined;
    return NextResponse.json({ error: msg, reason: r.reason, candidatos }, { status: r.reason === 'FORBIDDEN' ? 403 : r.reason === 'RH_ERROR' ? 502 : 400 });
  }
  return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
}
