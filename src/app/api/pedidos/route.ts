import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { editarPedido, enviarPedido } from '@/lib/pedidos/pedidos';

/**
 * Pedidos por setor (v1.185.0): a unidade ENVIA a lista escrita ao CD/Fábrica.
 * Guarda: módulo ORDERS, "editar". Quem recebe marca em /api/pedidos/recebidos.
 */
const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem permissão para enviar pedidos desta unidade', status: 403 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
  NOT_FOUND: { msg: 'Pedido ou unidade não encontrados', status: 404 },
  ESTADO: { msg: 'A situação atual não permite esta ação', status: 409 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  const acao = String(b?.acao ?? 'enviar');
  const textos = (b?.textos && typeof b.textos === 'object' ? b.textos : {}) as Record<string, unknown>;
  if (acao === 'editar') {
    const e = await editarPedido(user, { id: String(b?.id ?? ''), textos, observacao: b?.observacao === undefined ? undefined : String(b.observacao) }, requestContext(req));
    if (!e.ok) return reasonResponse(REASONS, e.reason, e.message);
    return NextResponse.json({ ok: true, id: e.id, number: e.number });
  }
  if (acao !== 'enviar') return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  const r = await enviarPedido(user, { unitId: String(b?.unitId ?? ''), textos: (b?.textos && typeof b.textos === 'object' ? b.textos : {}) as Record<string, unknown>, observacao: b?.observacao ? String(b.observacao) : undefined }, requestContext(req));
  if (!r.ok) return reasonResponse(REASONS, r.reason, r.message);
  return NextResponse.json({ ok: true, id: r.id, number: r.number });
}
