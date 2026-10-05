import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { removeUpload, saveEvidence, UploadError } from '@/lib/uploads';
import { criarAcao, finalizarVisita, gerarOcorrencia, iniciarVisita, responderItem, validarAcao } from '@/lib/supervisor/operacional';

/**
 * Acompanhamento operacional (v1.155.0). Uma rota, uma ação por chamada:
 *  - iniciar      { visitId? | unitId? }
 *  - responder    multipart: responseId, answer, note, gravity, sampleChecked, sampleOk, temperature, removerFoto, foto
 *  - acao         { visitId, responseId?, problem, category?, responsibleName?, dueDate?, gravity?, note? }
 *  - ocorrencia   { responseId, typeId, categoryId? }
 *  - validar      { actionId, visitId, resolvido, nota? }
 *  - finalizar    { visitId, comentario? }
 * Guarda: aba "Acompanhamento operacional" (editar); escopo e regras na lib.
 */
const RECUSAS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem permissão para esta unidade ou ação.', status: 403 },
  INVALID: { msg: 'Dados inválidos.', status: 400 },
  NAO_ENCONTRADO: { msg: 'Não encontrado.', status: 404 },
  ENCERRADA: { msg: 'Esta visita já foi concluída ou cancelada.', status: 409 },
  TIPO: { msg: 'Tipo inválido.', status: 400 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const ctx = requestContext(req);

  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const f = await req.formData();
    const responseId = String(f.get('responseId') ?? '');
    const resp = await prisma.visitAuditResponse.findUnique({ where: { id: responseId }, select: { visit: { select: { unitId: true } } } });
    if (!resp) return NextResponse.json({ error: RECUSAS.NAO_ENCONTRADO.msg }, { status: 404 });
    // escopo ANTES de gravar o arquivo: foto de unidade alheia nem chega ao volume
    if (!canAccessUnit(user, resp.visit.unitId)) return NextResponse.json({ error: RECUSAS.FORBIDDEN.msg }, { status: 403 });
    let photoPath: string | null = null;
    const foto = f.get('foto');
    try {
      if (foto instanceof File && foto.size > 0) photoPath = await saveEvidence(foto, resp.visit.unitId, `visita-${responseId}`);
    } catch (e) {
      if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
      throw e;
    }
    const s = (k: string) => { const v = f.get(k); return v == null || v === '' ? null : String(v); };
    const n = (k: string) => { const v = s(k); return v == null ? null : Number(v.replace(',', '.')); };
    const r = await responderItem(user, {
      responseId, answer: s('answer') as never, note: s('note'), gravity: s('gravity') as never,
      sampleChecked: n('sampleChecked'), sampleOk: n('sampleOk'), temperature: n('temperature'), photoPath, removerFoto: s('removerFoto'),
    }, ctx);
    if (!r.ok) {
      if (photoPath) await removeUpload(photoPath).catch(() => {});
      const x = RECUSAS[r.reason];
      return NextResponse.json({ error: r.detail ?? x.msg }, { status: x.status });
    }
    return NextResponse.json({ ok: true, answer: r.answer, foto: photoPath });
  }

  const b = await req.json().catch(() => null);
  if (!b?.acao) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r =
    b.acao === 'iniciar' ? await iniciarVisita(user, { visitId: b.visitId ? String(b.visitId) : undefined, unitId: b.unitId ? String(b.unitId) : undefined }, ctx)
    : b.acao === 'acao' ? await criarAcao(user, { visitId: String(b.visitId ?? ''), responseId: b.responseId ? String(b.responseId) : null, problem: String(b.problem ?? ''), category: b.category ?? null, responsibleName: b.responsibleName ?? null, dueDate: b.dueDate || null, gravity: b.gravity ?? null, note: b.note ?? null }, ctx)
    : b.acao === 'ocorrencia' ? await gerarOcorrencia(user, { responseId: String(b.responseId ?? ''), typeId: String(b.typeId ?? ''), categoryId: b.categoryId ? String(b.categoryId) : null }, ctx)
    : b.acao === 'validar' ? await validarAcao(user, { actionId: String(b.actionId ?? ''), visitId: String(b.visitId ?? ''), resolvido: b.resolvido === true, nota: b.nota ?? null }, ctx)
    : b.acao === 'finalizar' ? await finalizarVisita(user, { visitId: String(b.visitId ?? ''), comentario: b.comentario ?? null }, ctx)
    : null;
  if (!r) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  if (!r.ok) { const x = RECUSAS[r.reason]; return NextResponse.json({ error: r.detail ?? x.msg }, { status: x.status }); }
  return NextResponse.json(r);
}
