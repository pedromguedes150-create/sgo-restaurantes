import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { reasonResponse } from '@/lib/api/reason';
import {
  corrigirDesperdicio, corrigirRecebimento, estadoDoDia, excluirDesperdicio, excluirRecebimento,
  portaDaSessao, registrarContagem, registrarDesperdicio, registrarRecebimento,
} from '@/lib/pizzas/massas';
import { FORMATO_DATA } from '@/lib/pizzas/massas-tipos';
import { RECUSAS_MASSAS, acaoDeMassas } from '@/lib/pizzas/massas-rota';

/**
 * GESTÃO do Controle de Massas — autenticada (Gerente/Supervisão/Admin/CEO).
 *
 * A mesma gravação do link, por outra porta: aqui QUALQUER dia até hoje pode
 * ser corrigido, e dia anterior exige `motivo` (vira `retroactive` no
 * histórico). Mora sob o prefixo público `/api/pizzas`, como
 * `/api/pizzas/sabores`: o prefixo mais longo vence e esta entra na matriz.
 */

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const url = new URL(req.url);
  const porta = await portaDaSessao(user, url.searchParams.get('unit') ?? '');
  if (!porta) return reasonResponse(RECUSAS_MASSAS, 'FORBIDDEN');
  const data = url.searchParams.get('data') ?? porta.hoje;
  if (!FORMATO_DATA.test(data)) return reasonResponse(RECUSAS_MASSAS, 'DATA');
  return NextResponse.json(await estadoDoDia(porta.unit, data));
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.unitId !== 'string') return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const porta = await portaDaSessao(user, body.unitId);
  if (!porta) return reasonResponse(RECUSAS_MASSAS, 'FORBIDDEN');

  const acao = acaoDeMassas(body.acao);
  if (!acao) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });

  const ctx = requestContext(req);
  const data = typeof body.data === 'string' ? body.data : porta.hoje;
  const id = typeof body.id === 'string' ? body.id : '';
  const motivo = typeof body.motivo === 'string' ? body.motivo : null;

  const r =
    acao === 'recebimento' ? await registrarRecebimento(porta, { data, quantidade: body.quantidade, validade: String(body.validade ?? ''), lotCode: body.lotCode ?? null, motivo }, ctx)
    : acao === 'corrigirRecebimento' ? await corrigirRecebimento(porta, id, { quantidade: body.quantidade, validade: String(body.validade ?? ''), lotCode: body.lotCode ?? null, motivo }, ctx)
    : acao === 'excluirRecebimento' ? await excluirRecebimento(porta, id, motivo, ctx)
    : acao === 'desperdicio' ? await registrarDesperdicio(porta, { data, quantidade: body.quantidade, motivo: body.motivoDesperdicio, observacao: body.observacao ?? null, loteId: body.loteId ?? null, motivoAlteracao: motivo }, ctx)
    : acao === 'corrigirDesperdicio' ? await corrigirDesperdicio(porta, id, { quantidade: body.quantidade, motivo: body.motivoDesperdicio, observacao: body.observacao ?? null, loteId: body.loteId ?? null, motivoAlteracao: motivo }, ctx)
    : acao === 'excluirDesperdicio' ? await excluirDesperdicio(porta, id, motivo, ctx)
    : await registrarContagem(porta, { data, fisico: body.fisico, justificativa: body.justificativa ?? null, motivoAlteracao: motivo }, ctx);

  if (!r.ok) return reasonResponse(RECUSAS_MASSAS, r.reason);
  return NextResponse.json(r);
}
