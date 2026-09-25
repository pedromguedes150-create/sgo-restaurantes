import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { fechamentoDoDia, portaDeFechamento, salvarFechamentoSessao, type MotivoRecusaSessao } from '@/lib/pizzas/fechamento';
import { FORMATO_DATA } from '@/lib/pizzas/tipos';

/**
 * GESTÃO do fechamento de pizzas — autenticada (Gerente/Supervisão/Admin/CEO).
 *
 * A mesma gravação do link público, por outra porta: é aqui que o supervisor
 * audita e corrige o que o funcionário lançou errado, sem depender do link.
 * Mora sob o prefixo público `/api/pizzas`, como `/api/pizzas/sabores` e
 * `/api/pizzas/massas/gestao`: o prefixo mais longo vence e esta entra na matriz.
 */

const RECUSAS: Record<MotivoRecusaSessao, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem permissão para corrigir o fechamento desta unidade', status: 403 },
  DATA: { msg: 'Data fora do período permitido', status: 400 },
  QUANTIDADES: { msg: 'As quantidades precisam ser números inteiros a partir de zero', status: 400 },
  VAZIO: { msg: 'Informe ao menos uma pizza para fechar o dia', status: 400 },
  MOTIVO: { msg: 'Informe o motivo da correção', status: 400 },
};

/** Carrega o fechamento de uma data para o supervisor auditar/corrigir. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const url = new URL(req.url);
  const porta = await portaDeFechamento(user, url.searchParams.get('unit') ?? '');
  if (!porta) return NextResponse.json({ error: RECUSAS.FORBIDDEN.msg }, { status: 403 });

  const data = url.searchParams.get('data') ?? porta.hoje;
  if (!FORMATO_DATA.test(data)) return NextResponse.json({ error: RECUSAS.DATA.msg }, { status: 400 });

  const closing = await fechamentoDoDia(porta.unit.id, data);
  return NextResponse.json({ hoje: porta.hoje, operationalDate: data, closing });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.unitId !== 'string' || typeof body.operationalDate !== 'string') {
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }

  const r = await salvarFechamentoSessao(
    user,
    {
      unitId: body.unitId,
      operationalDate: body.operationalDate,
      contagens: body.contagens ?? {},
      observation: body.observation ?? null,
      motivo: body.motivo ?? null,
    },
    requestContext(req),
  );

  if (!r.ok) {
    const { msg, status } = RECUSAS[r.reason];
    return NextResponse.json({ error: msg, reason: r.reason }, { status });
  }
  return NextResponse.json({ ok: true, total: r.total, substituiu: r.substituiu, operationalDate: r.operationalDate });
}
