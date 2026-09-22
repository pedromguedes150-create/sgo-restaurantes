import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createPayout } from '@/lib/people/payouts';
import {
  editarLancamento, excluirLancamento, fecharCompetencia, lancarEmLote,
  reabrirCompetencia, registrarEntrega,
} from '@/lib/people/payouts-competencia';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';

/** GET ?collaboratorId= — histórico de lançamentos do colaborador (p/ variação ao lançar). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const collaboratorId = new URL(req.url).searchParams.get('collaboratorId');
  if (!collaboratorId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const collab = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { units: { select: { unitId: true } } } });
  if (!collab || !collab.units.some((u) => canAccessUnit(user, u.unitId))) return NextResponse.json({ history: [] });
  const rows = await prisma.collaboratorPayout.findMany({
    where: { collaboratorId },
    orderBy: [{ yearMonth: 'desc' }, { createdAt: 'desc' }],
    take: 12,
  });
  return NextResponse.json({
    history: rows.map((r) => ({ yearMonth: r.yearMonth, type: r.type, amount: Number(r.amount), note: r.note })),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const b = await req.json().catch(() => null);
  if (!b?.collaboratorId || !b?.type || !b?.yearMonth) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await createPayout(user, {
    collaboratorId: String(b.collaboratorId), type: b.type, yearMonth: String(b.yearMonth),
    amount: Number(b.amount), note: b.note,
  }, requestContext(req));
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const msg = r.reason === 'FORBIDDEN' ? 'Apenas Supervisão/Admin lançam comissões e mobilidade' : r.reason === 'NOT_FOUND' ? 'Colaborador não encontrado' : 'Dados inválidos';
    return NextResponse.json({ error: msg }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, id: r.id });
}

/**
 * Ações da competência (v1.108.0): lote, edição, exclusão, entrega e
 * fechamento. Cada uma carrega o TIPO, porque comissão e mobilidade são
 * independentes em tudo — inclusive no fechamento.
 */
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const b = await req.json().catch(() => null);
  const acao = String(b?.action ?? '');
  const ctx = requestContext(req);
  const tipo = b?.tipo === 'COMMISSION' || b?.tipo === 'MOBILITY' ? b.tipo : null;

  let r: Awaited<ReturnType<typeof lancarEmLote>> | null = null;
  if (acao === 'lote' && tipo) {
    r = await lancarEmLote(user, {
      competencia: String(b?.competencia ?? ''), tipo,
      itens: Array.isArray(b?.itens) ? b.itens.map((i: { collaboratorId?: unknown; amount?: unknown; note?: unknown }) => ({
        collaboratorId: String(i?.collaboratorId ?? ''), amount: Number(i?.amount), note: i?.note ? String(i.note) : null,
      })) : [],
    }, ctx);
  } else if (acao === 'editar') {
    r = await editarLancamento(user, String(b?.id ?? ''), {
      amount: b?.amount != null ? Number(b.amount) : undefined,
      note: b?.note === undefined ? undefined : (b.note ? String(b.note) : null),
    }, ctx);
  } else if (acao === 'excluir') {
    r = await excluirLancamento(user, String(b?.id ?? ''), ctx);
  } else if (acao === 'entrega' && tipo) {
    r = await registrarEntrega(user, {
      unitId: String(b?.unitId ?? ''), competencia: String(b?.competencia ?? ''), tipo,
      entregaEm: b?.entregaEm ? String(b.entregaEm) : null,
    }, ctx);
  } else if (acao === 'fechar' && tipo) {
    r = await fecharCompetencia(user, String(b?.competencia ?? ''), tipo, ctx);
  } else if (acao === 'reabrir' && tipo) {
    r = await reabrirCompetencia(user, String(b?.competencia ?? ''), tipo, ctx);
  }

  if (!r) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const status: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400, FECHADA: 409 };
    const padrao: Record<string, string> = {
      FORBIDDEN: 'Apenas Supervisão/Admin lançam comissões e mobilidade',
      NOT_FOUND: 'Lançamento não encontrado',
      INVALID: 'Dados inválidos',
      FECHADA: 'Competência finalizada.',
    };
    return NextResponse.json({ error: r.message ?? padrao[r.reason] }, { status: status[r.reason] ?? 400 });
  }
  return NextResponse.json({ ok: true, gravados: r.gravados, ignorados: r.ignorados });
}
