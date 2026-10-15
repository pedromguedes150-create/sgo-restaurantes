import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { criarDemanda } from '@/lib/rh/demandas';

const REASONS = {
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
  NOT_FOUND: { msg: 'Colaborador não encontrado nesta unidade', status: 404 },
};

/** Demanda ao RH (v1.168.0): o gerente registra; a fila de saída envia. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const r = await criarDemanda(user, {
    unitId: String(b.unitId ?? ''),
    tipo: String(b.tipo ?? ''),
    titulo: String(b.titulo ?? ''),
    descricao: b.descricao ? String(b.descricao) : undefined,
    collaboratorId: b.collaboratorId ? String(b.collaboratorId) : null,
    dataEvento: b.dataEvento ? String(b.dataEvento) : null,
    prioridade: b.prioridade ? String(b.prioridade) : undefined,
  }, requestContext(req));
  if (!r.ok) return reasonResponse(REASONS, r.reason, r.message);
  return NextResponse.json({ ok: true, id: r.id });
}
