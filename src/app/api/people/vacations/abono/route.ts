import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { excluirAbono, registrarAbono } from '@/lib/people/abono';
import { MAX_DIAS_ABONO } from '@/lib/people/periodo-aquisitivo';

/**
 * Abono pecuniário (venda de dias de férias) — v1.153.0.
 *  - acao "registrar": { collaboratorId, periodoInicio, dias, observacao? }
 *  - acao "excluir":   { id }
 * Mesma guarda da aba Férias de Pessoas (PEOPLE_TAB_VACATION/editar); escopo
 * por unidade e as regras do abono ficam em `lib/people/abono.ts`.
 */
const RECUSAS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem permissão para este colaborador.', status: 403 },
  INVALID: { msg: 'Dados inválidos.', status: 400 },
  DIAS: { msg: `Informe de 1 a ${MAX_DIAS_ABONO} dias.`, status: 400 },
  PERIODO: { msg: 'Período aquisitivo não encontrado para este colaborador (confira a admissão no RH).', status: 400 },
  SALDO: { msg: 'O período não tem saldo suficiente para vender esses dias.', status: 400 },
  JA_EXISTE: { msg: 'Já existe um abono registrado para este período aquisitivo.', status: 409 },
  NAO_ENCONTRADO: { msg: 'Registro não encontrado.', status: 404 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.acao) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  const r = b.acao === 'registrar'
    ? await registrarAbono(user, { collaboratorId: String(b.collaboratorId ?? ''), periodoInicio: String(b.periodoInicio ?? ''), dias: Number(b.dias), observacao: b.observacao ? String(b.observacao) : null }, ctx)
    : b.acao === 'excluir'
      ? await excluirAbono(user, String(b.id ?? ''), ctx)
      : null;
  if (!r) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  if (!r.ok) { const x = RECUSAS[r.reason]; return NextResponse.json({ error: x.msg }, { status: x.status }); }
  return NextResponse.json({ ok: true, id: r.id });
}
