import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { canEditModule } from '@/lib/permissions';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { desvincularOcorrencia, informarOcorrencia, justificarOcorrencia, revisarOcorrencia, vincularOcorrencia, type DecisaoDaRevisao } from '@/lib/auditoria-operacional/auditoria';

/**
 * Auditoria operacional por ocorrência (v1.184.0): `informar` (supervisão),
 * `vincular`/`desvincular` (supervisão), `justificar` (gerente ou supervisão),
 * `revisar` (supervisão decide). O módulo `OPERATIONAL_AUDIT` da matriz é a
 * porta: ver = acompanhar e justificar; editar = informar, vincular e decidir.
 * A regra de perfil (`podeAuditar`) vive na lib.
 */
const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem permissão para esta ação', status: 403 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
  NOT_FOUND: { msg: 'Registro não encontrado', status: 404 },
  DUPLICATE: { msg: 'Já existe uma ocorrência igual neste dia', status: 409 },
  ESTADO: { msg: 'A situação atual não permite esta ação', status: 409 },
};
const EXIGEM_EDITAR = new Set(['informar', 'vincular', 'desvincular', 'revisar']);

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const b = await req.json().catch(() => null);
  const acao = String(b?.acao ?? '');
  const ctx = requestContext(req);
  if (EXIGEM_EDITAR.has(acao) && !(await canEditModule(user.role, 'OPERATIONAL_AUDIT'))) return NextResponse.json({ error: 'Sem permissão', reason: 'FORBIDDEN' }, { status: 403 });

  let r;
  if (acao === 'informar') {
    r = await informarOcorrencia(user, {
      modulo: String(b.modulo ?? ''), unitId: String(b.unitId ?? ''), reference: String(b.reference ?? ''), eventDate: String(b.eventDate ?? ''), noticeAt: String(b.noticeAt ?? ''),
      source: b.source ? String(b.source) : undefined, sourceDetail: b.sourceDetail ? String(b.sourceDetail) : undefined, expectedUserId: b.expectedUserId ? String(b.expectedUserId) : null, note: b.note ? String(b.note) : undefined,
    }, ctx);
  } else if (acao === 'vincular') {
    r = await vincularOcorrencia(user, String(b.id ?? ''), String(b.entryId ?? ''), ctx);
  } else if (acao === 'desvincular') {
    r = await desvincularOcorrencia(user, String(b.id ?? ''), ctx);
  } else if (acao === 'justificar') {
    r = await justificarOcorrencia(user, String(b.id ?? ''), String(b.texto ?? ''), ctx);
  } else if (acao === 'revisar') {
    r = await revisarOcorrencia(user, String(b.id ?? ''), { decisao: String(b.decisao ?? '') as DecisaoDaRevisao, nota: b.nota ? String(b.nota) : undefined, responsibleUserId: b.responsibleUserId ? String(b.responsibleUserId) : null }, ctx);
  } else {
    return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  }
  if (!r.ok) return reasonResponse(REASONS, r.reason, r.message);
  return NextResponse.json({ ok: true, id: r.id });
}
