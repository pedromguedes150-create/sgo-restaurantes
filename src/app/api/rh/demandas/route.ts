import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { criarDemanda } from '@/lib/rh/demandas';
import { AnexoInvalido, guardarAnexo, removerAnexo, type AnexoGuardado } from '@/lib/rh/demanda-arquivo';
import { ANEXOS_MAX } from '@/lib/rh/solicitacoes-regras';

const REASONS = {
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
  NOT_FOUND: { msg: 'Colaborador não encontrado nesta unidade', status: 404 },
};

/**
 * Solicitação ao RH: o gerente registra; a fila de saída envia.
 *
 * Aceita JSON (sem anexo) ou multipart (campo `dados` em JSON + arquivos em
 * `anexo`). A unidade só passa se estiver no alcance da sessão — conferido
 * ANTES de gravar qualquer arquivo; recusada a solicitação, os arquivos saem.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  let b: Record<string, unknown> | null = null;
  let arquivos: File[] = [];
  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    const dados = form?.get('dados');
    try { b = typeof dados === 'string' ? JSON.parse(dados) : null; } catch { b = null; }
    arquivos = (form?.getAll('anexo') ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  } else {
    b = await req.json().catch(() => null);
  }
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const unitId = String(b.unitId ?? '');
  if (!unitId || !canAccessUnit(user, unitId)) return NextResponse.json({ error: REASONS.FORBIDDEN.msg, reason: 'FORBIDDEN' }, { status: 403 });
  if (arquivos.length > ANEXOS_MAX) return NextResponse.json({ error: `No máximo ${ANEXOS_MAX} anexos.` }, { status: 400 });

  const anexos: AnexoGuardado[] = [];
  const limpar = () => Promise.all(anexos.map((a) => removerAnexo(a.path)));
  try {
    for (const f of arquivos) anexos.push(await guardarAnexo(f, unitId));
  } catch (e) {
    await limpar();
    if (e instanceof AnexoInvalido) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }

  let r;
  try {
    r = await criarDemanda(user, {
      unitId,
      tipo: String(b.tipo ?? ''),
      titulo: String(b.titulo ?? ''),
      descricao: b.descricao ? String(b.descricao) : undefined,
      collaboratorId: b.collaboratorId ? String(b.collaboratorId) : null,
      dataEvento: b.dataEvento ? String(b.dataEvento) : null,
      prioridade: b.prioridade ? String(b.prioridade) : undefined,
      detalhes: b.detalhes,
      urgenciaMotivo: b.urgenciaMotivo ? String(b.urgenciaMotivo) : undefined,
      anexos,
    }, requestContext(req));
  } catch (e) {
    await limpar();
    throw e;
  }
  if (!r.ok) {
    await limpar();
    return reasonResponse(REASONS, r.reason, r.message);
  }
  return NextResponse.json({ ok: true, id: r.id });
}
