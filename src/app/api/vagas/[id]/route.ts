import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { anexarCurriculos, aprovarVaga, avaliarCurriculo, cancelarVaga, corrigirVaga, devolverVaga, editarVaga, excluirVaga, reenviarAoRh, removerCurriculo } from '@/lib/vagas/acoes';
import { lerCorpo } from '@/lib/vagas/formulario-http';

export const dynamic = 'force-dynamic';

/**
 * As ações sobre UMA vaga. A porta da rota é ver o módulo; QUEM pode o quê
 * (dono × aprovador, por situação) é conferido na lib, com a mesma tabela da tela.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const corpo = await lerCorpo(req);
  if (!corpo) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const d = corpo.dados;
  const ctx = requestContext(req);
  const id = params.id;
  try {
    let r;
    switch (String(d.acao ?? '')) {
      case 'aprovar': r = await aprovarVaga(user, id, ctx); break;
      case 'devolver': r = await devolverVaga(user, id, d.motivo, ctx); break;
      case 'cancelar': r = await cancelarVaga(user, id, d.motivo, ctx); break;
      case 'excluir': r = await excluirVaga(user, id, d.motivo, ctx); break;
      case 'corrigir': r = await corrigirVaga(user, id, d, ctx); break;
      case 'editar': r = await editarVaga(user, id, d, ctx); break;
      case 'reenviar': r = await reenviarAoRh(user, id, ctx); break;
      case 'anexar': r = await anexarCurriculos(user, id, corpo.arquivos, ctx); break;
      case 'removerCurriculo': r = await removerCurriculo(user, id, String(d.curriculoId ?? ''), ctx); break;
      case 'avaliarCurriculo': r = await avaliarCurriculo(user, id, String(d.curriculoId ?? ''), { enviar: d.enviar === true, motivo: d.motivo, observacao: d.observacao }, ctx); break;
      default: return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
    }
    if (!r.ok) return NextResponse.json({ error: r.error, erros: r.erros }, { status: r.status });
    return NextResponse.json(r);
  } catch (e) {
    console.error('[vagas] falha na ação:', e);
    return NextResponse.json({ error: 'Não foi possível concluir. Tente de novo.' }, { status: 500 });
  }
}
