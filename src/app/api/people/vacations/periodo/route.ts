import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { editarPeriodoDeFerias, excluirPeriodoDeFerias, lancarPeriodoDeFerias, MAX_DIAS_PERIODO } from '@/lib/people/ferias-periodo';
import { MAX_DIAS_ABONO } from '@/lib/people/periodo-aquisitivo';

/**
 * Período de férias lançado à mão (v1.159.0).
 *  - acao "lancar":  { collaboratorId, startDate, endDate, note?, unitId? }
 *  - acao "editar":  { id, startDate, endDate, note? }
 *  - acao "excluir": { id }
 * Mesma guarda da aba Férias de Pessoas (PEOPLE_TAB_VACATION/editar); escopo e
 * regras em `lib/people/ferias-periodo.ts`.
 */
const RECUSAS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem permissão para este colaborador.', status: 403 },
  INVALID: { msg: `Datas inválidas: informe início e fim (AAAA-MM-DD), fim depois do início, até ${MAX_DIAS_PERIODO} dias.`, status: 400 },
  NAO_ENCONTRADO: { msg: 'Colaborador ou período não encontrado.', status: 404 },
  SOBREPOE: { msg: 'Já existe um período lançado cruzando essas datas. Edite ou exclua aquele primeiro.', status: 409 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.acao) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);
  const r = b.acao === 'lancar'
    ? await lancarPeriodoDeFerias(user, { collaboratorId: String(b.collaboratorId ?? ''), startDate: String(b.startDate ?? ''), endDate: String(b.endDate ?? ''), note: b.note != null ? String(b.note) : null, unitId: b.unitId ? String(b.unitId) : null, diasVendidos: b.diasVendidos != null && b.diasVendidos !== '' ? Number(b.diasVendidos) : 0, periodoInicio: b.periodoInicio ? String(b.periodoInicio) : null }, ctx)
    : b.acao === 'editar'
      ? await editarPeriodoDeFerias(user, String(b.id ?? ''), { startDate: String(b.startDate ?? ''), endDate: String(b.endDate ?? ''), note: b.note != null ? String(b.note) : undefined }, ctx)
      : b.acao === 'excluir'
        ? await excluirPeriodoDeFerias(user, String(b.id ?? ''), ctx)
        : null;
  if (!r) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const x = RECUSAS[r.reason];
    const detalhe = 'detalhe' in r && r.detalhe ? ` (${r.detalhe})` : '';
    return NextResponse.json({ error: x.msg + detalhe }, { status: x.status });
  }
  const ok = r as { ok: true; id?: string; substituiuRh?: number; confirmouSolicitada?: boolean; abono?: { ok: boolean; dias?: number; periodoInicio?: string; reason?: string } };
  const ABONO: Record<string, string> = { DIAS: `dias vendidos de 1 a ${MAX_DIAS_ABONO}`, SALDO: 'o período aquisitivo não tem saldo para esses dias', JA_EXISTE: 'este período aquisitivo já tem venda registrada', PERIODO: 'nenhum período aquisitivo com saldo para vender', FORBIDDEN: 'sem permissão', INVALID: 'dados inválidos', NAO_ENCONTRADO: 'colaborador não encontrado' };
  const abono = ok.abono ? (ok.abono.ok ? ok.abono : { ok: false, erro: ABONO[ok.abono.reason ?? ''] ?? ok.abono.reason }) : undefined;
  return NextResponse.json({ ok: true, id: ok.id, substituiuRh: ok.substituiuRh, confirmouSolicitada: ok.confirmouSolicitada, abono });
}
