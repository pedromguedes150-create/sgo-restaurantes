import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { recusaDeAba } from '@/lib/permissions/guarda-abas';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { informarAtestadoEsperado, justificarEsperado, revisarEsperado, type DecisaoDaRevisao } from '@/lib/certificates/auditoria';

/**
 * Auditoria de atestados (v1.181.0): `informar` (RH/supervisão), `justificar`
 * (gerente ou supervisão), `revisar` (supervisão decide). A aba "Auditoria de
 * lançamentos" da matriz é a porta: ver = acompanhar e justificar; editar =
 * informar e revisar (`guarda-abas`). A regra de perfil vive na lib.
 */
const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem permissão para esta ação', status: 403 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
  NOT_FOUND: { msg: 'Registro não encontrado', status: 404 },
  NO_LINK: { msg: 'Este colaborador não está vinculado a esta unidade', status: 400 },
  DUPLICATE: { msg: 'Já existe um atestado esperado deste colaborador neste período', status: 409 },
  ESTADO: { msg: 'A situação atual não permite esta ação', status: 409 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const b = await req.json().catch(() => null);
  const acao = String(b?.acao ?? '');
  const ctx = requestContext(req);
  const negado = await recusaDeAba(user.role, 'CERTIFICATES', acao);
  if (negado) return negado;

  let r;
  if (acao === 'informar') {
    r = await informarAtestadoEsperado(user, {
      unitId: String(b.unitId ?? ''), collaboratorId: String(b.collaboratorId ?? ''), startDate: String(b.startDate ?? ''), endDate: String(b.endDate ?? ''),
      noticeAt: String(b.noticeAt ?? ''), receivedByName: b.receivedByName ? String(b.receivedByName) : undefined, note: b.note ? String(b.note) : undefined,
    }, ctx);
  } else if (acao === 'justificar') {
    r = await justificarEsperado(user, String(b.id ?? ''), String(b.texto ?? ''), ctx);
  } else if (acao === 'revisar') {
    r = await revisarEsperado(user, String(b.id ?? ''), { decisao: String(b.decisao ?? '') as DecisaoDaRevisao, nota: b.nota ? String(b.nota) : undefined, responsibleUserId: b.responsibleUserId ? String(b.responsibleUserId) : null }, ctx);
  } else {
    return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  }
  if (!r.ok) return reasonResponse(REASONS, r.reason, r.message);
  return NextResponse.json({ ok: true, id: r.id });
}
