import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { ArquivoInvalido, guardarCurriculo, removerCurriculo } from '@/lib/curriculos/arquivo';
import { encaminharCurriculo, JANELA_DE_DUPLICIDADE_DIAS, type MotivoDaRecusa } from '@/lib/curriculos/curriculos';

/**
 * Novo encaminhamento de currículo (multipart: o arquivo é OBRIGATÓRIO).
 * A unidade vem do corpo mas só passa se estiver no alcance da sessão —
 * conferido ANTES de gravar o arquivo; o gerente que encaminha é o da sessão.
 */
const RECUSAS: Record<MotivoDaRecusa, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Você não pode encaminhar currículo por esta unidade.', status: 403 },
  NOME: { msg: 'Informe o nome completo do candidato (nome e sobrenome).', status: 400 },
  TELEFONE: { msg: 'Informe o telefone com DDD (10 ou 11 dígitos).', status: 400 },
  CARGO: { msg: 'Escolha o cargo pretendido.', status: 400 },
  SEM_ARQUIVO: { msg: 'Anexe o currículo (PDF, JPG ou PNG).', status: 400 },
  DUPLICADO: { msg: `Este candidato já foi encaminhado para este cargo nos últimos ${JANELA_DE_DUPLICIDADE_DIAS} dias. Veja na lista.`, status: 409 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const txt = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v.trim() : ''; };
  const unitId = txt('unitId');
  if (!unitId || !canAccessUnit(user, unitId)) return NextResponse.json({ error: RECUSAS.FORBIDDEN.msg }, { status: 403 });

  const arquivo = form.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: RECUSAS.SEM_ARQUIVO.msg, reason: 'SEM_ARQUIVO' }, { status: 400 });
  let salvo: { path: string; mime: string };
  try {
    salvo = await guardarCurriculo(arquivo, unitId);
  } catch (e) {
    if (e instanceof ArquivoInvalido) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }

  let r;
  try {
    r = await encaminharCurriculo(user, {
      unitId, candidateName: txt('candidateName'), phone: txt('phone'), jobTitleId: txt('jobTitleId'), note: txt('note'),
      attachmentPath: salvo.path, attachmentMime: salvo.mime,
    }, requestContext(req));
  } catch (e) {
    await removerCurriculo(salvo.path);
    throw e;
  }

  if (!r.ok) {
    /* O arquivo foi gravado antes de a regra decidir: recusado, sai junto. */
    await removerCurriculo(salvo.path);
    const m = RECUSAS[r.reason];
    return NextResponse.json({ error: m.msg, reason: r.reason }, { status: m.status });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
