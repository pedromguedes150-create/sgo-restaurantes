import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import {
  abrirContagem, aprovarInventario, devolverInventario, enviarInventario, registrarConferencia, salvarRascunho, type Motivo,
} from '@/lib/utensilios/inventario';

/**
 * Inventário de Utensílios — todas as ações numa rota (JSON):
 * abrir · salvar · enviar (gerente) · conferir · aprovar · devolver (auditoria).
 * A unidade é conferida na sessão dentro da lib; o corpo nunca escolhe unidade
 * de fora do alcance.
 */
const STATUS: Record<Motivo, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400, STATE: 409, INCOMPLETO: 400 };
const MENSAGEM: Record<Motivo, string> = {
  FORBIDDEN: 'Sem permissão para esta ação.', NOT_FOUND: 'Inventário não encontrado.', INVALID: 'Dados inválidos.',
  STATE: 'Situação do inventário não permite esta ação.', INCOMPLETO: 'Há itens sem quantidade.',
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const barrado = await guardaDaRota(user.role, req);
  if (barrado) return barrado;
  const b = await req.json().catch(() => ({}));
  const ctx = requestContext(req);
  const acao = String(b?.acao ?? '');
  const id = String(b?.id ?? '');
  const preenchimento = { managerId: b?.managerId ? String(b.managerId) : undefined, notes: b?.notes, itens: Array.isArray(b?.itens) ? b.itens : [], novos: Array.isArray(b?.novos) ? b.novos : [], remover: Array.isArray(b?.remover) ? b.remover.map(String) : [] };

  let r;
  if (acao === 'abrir') r = await abrirContagem(user, String(b?.unitId ?? ''), ctx);
  else if (acao === 'salvar') r = await salvarRascunho(user, id, preenchimento, ctx);
  else if (acao === 'enviar') r = await enviarInventario(user, id, preenchimento, ctx);
  else if (acao === 'conferir') r = await registrarConferencia(user, id, { auditadas: b?.auditadas && typeof b.auditadas === 'object' ? b.auditadas : {}, observacao: b?.observacao }, ctx);
  else if (acao === 'aprovar') r = await aprovarInventario(user, id, b?.observacao, ctx);
  else if (acao === 'devolver') r = await devolverInventario(user, id, b?.motivo, ctx);
  else return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 });

  if (!r.ok) return NextResponse.json({ error: r.message ?? MENSAGEM[r.reason], reason: r.reason, faltam: r.faltam }, { status: STATUS[r.reason] });
  return NextResponse.json(r);
}
