import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { corrigirAdmissao, informarGozo } from '@/lib/people/ferias-manual';

/**
 * Férias preenchidas à mão (v1.154.0).
 *  - acao "admissao": { collaboratorId, data: 'AAAA-MM-DD' | null, motivo } — só Supervisão/Admin/CEO
 *  - acao "gozo":     { collaboratorId, periodoInicio, diasGozados (0 = remove), observacao? }
 * Mesma guarda da aba Férias de Pessoas (PEOPLE_TAB_VACATION/editar); escopo e
 * regras em `lib/people/ferias-manual.ts`.
 */
const RECUSAS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem permissão para este colaborador ou para corrigir a admissão.', status: 403 },
  INVALID: { msg: 'Dados inválidos (data no futuro ou dias fora de 0 a 30).', status: 400 },
  MOTIVO: { msg: 'Informe o motivo da correção da admissão.', status: 400 },
  PERIODO: { msg: 'Período aquisitivo não encontrado para este colaborador.', status: 400 },
  SALDO: { msg: 'Dias gozados + dias vendidos passam de 30 neste período.', status: 400 },
  NAO_ENCONTRADO: { msg: 'Colaborador não encontrado.', status: 404 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.acao || !b?.collaboratorId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);
  const r = b.acao === 'admissao'
    ? await corrigirAdmissao(user, { collaboratorId: String(b.collaboratorId), data: b.data ? String(b.data) : null, motivo: b.motivo ? String(b.motivo) : null }, ctx)
    : b.acao === 'gozo'
      ? await informarGozo(user, { collaboratorId: String(b.collaboratorId), periodoInicio: String(b.periodoInicio ?? ''), diasGozados: Number(b.diasGozados), observacao: b.observacao ? String(b.observacao) : null }, ctx)
      : null;
  if (!r) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  if (!r.ok) { const x = RECUSAS[r.reason]; return NextResponse.json({ error: x.msg }, { status: x.status }); }
  return NextResponse.json({ ok: true });
}
