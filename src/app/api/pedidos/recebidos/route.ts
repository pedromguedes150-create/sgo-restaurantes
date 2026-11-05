import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { marcarSecao, moverLinha } from '@/lib/pedidos/pedidos';

/**
 * Pedidos por setor — quem RECEBE (v1.185.0): o separador do setor (ou Admin/CEO)
 * marca o bloco como Em separação (v1.188.0; antes "Recebido") ou Atendido. Guarda: módulo ORDERS_INBOX, "editar";
 * a regra de perfil e de setor vive na lib.
 */
const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Só o separador do setor (ou o Administrador) mexe neste bloco', status: 403 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
  NOT_FOUND: { msg: 'Bloco não encontrado', status: 404 },
  ESTADO: { msg: 'A situação atual não permite esta ação', status: 409 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  const acao = String(b?.acao ?? '');
  if (acao === 'mover') {
    const m = await moverLinha(user, { sectionId: String(b?.sectionId ?? ''), linha: Number(b?.linha), paraSectorId: String(b?.paraSectorId ?? '') }, requestContext(req));
    if (!m.ok) return reasonResponse(REASONS, m.reason, m.message);
    return NextResponse.json({ ok: true, id: m.id, number: m.number });
  }
  if (acao !== 'separar' && acao !== 'atender') return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  const r = await marcarSecao(user, String(b?.sectionId ?? ''), acao, requestContext(req));
  if (!r.ok) return reasonResponse(REASONS, r.reason, r.message);
  return NextResponse.json({ ok: true, id: r.id, number: r.number });
}
