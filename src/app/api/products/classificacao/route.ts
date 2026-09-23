import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { reasonResponse } from '@/lib/api/reason';
import { classificarProduto } from '@/lib/products/classificacao';

/**
 * Bloco "Pendentes de classificação" da fila do CD: define o setor do produto
 * e leva os itens dos pedidos abertos para a fila do setor.
 */
const RECUSAS = {
  FORBIDDEN: { msg: 'Sem permissão', status: 403 },
  NAO_ENCONTRADO: { msg: 'Produto não encontrado', status: 404 },
  INVALID: { msg: 'Escolha o setor', status: 400 },
  JA_USADO: { msg: 'Código já usado', status: 409 },
  SEM_SETOR: { msg: 'Escolha o setor', status: 400 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.productId || !b?.cdSectorId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await classificarProduto(user, String(b.productId), String(b.cdSectorId), requestContext(req));
  if (!r.ok) return reasonResponse(RECUSAS, r.reason, r.message);
  return NextResponse.json(r);
}
