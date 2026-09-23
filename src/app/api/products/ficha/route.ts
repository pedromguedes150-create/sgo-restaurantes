import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { reasonResponse } from '@/lib/api/reason';
import {
  adicionarCodigo, alterarEmLote, atualizarProduto, getFicha, removerCodigo, revisarCodigo, transferirCodigo,
} from '@/lib/products/ficha';

/**
 * A FICHA DO PRODUTO (Configurações → Catálogo): abrir, editar, códigos
 * (adicionar/remover/transferir/revisar) e alteração em lote.
 * Matriz: CONFIG_PRODUCTS com Editar; o perfil que mantém é conferido de novo
 * em `podeGerirCatalogo` (Admin/CEO/Supervisão/Coordenação).
 */

const RECUSAS = {
  FORBIDDEN: { msg: 'Sem permissão', status: 403 },
  NAO_ENCONTRADO: { msg: 'Produto não encontrado', status: 404 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
  JA_USADO: { msg: 'Este código já pertence a outro produto', status: 409 },
  SEM_SETOR: { msg: 'Produto do CD precisa de setor. Escolha o setor antes de salvar.', status: 400 },
};

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const ficha = await getFicha(user, id);
  if (!ficha) return reasonResponse(RECUSAS, 'NAO_ENCONTRADO');
  return NextResponse.json(ficha);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);
  const id = String(b.id ?? '');

  if (b.action === 'lote') {
    const r = await alterarEmLote(user, Array.isArray(b.ids) ? b.ids.map(String) : [], {
      ...(b.cdSectorId !== undefined ? { cdSectorId: String(b.cdSectorId) } : {}),
      ...(b.origin !== undefined ? { origin: String(b.origin) } : {}),
      ...(b.active !== undefined ? { active: Boolean(b.active) } : {}),
    }, ctx);
    if (!r.ok) return reasonResponse(RECUSAS, r.reason);
    return NextResponse.json(r);
  }

  const r =
    b.action === 'atualizar' ? await atualizarProduto(user, id, {
      ...(b.name !== undefined ? { name: String(b.name) } : {}),
      ...(b.category !== undefined ? { category: String(b.category) } : {}),
      ...(b.measure !== undefined ? { measure: String(b.measure) } : {}),
      ...(b.origin !== undefined ? { origin: String(b.origin) } : {}),
      ...(b.cdSectorId !== undefined ? { cdSectorId: b.cdSectorId ? String(b.cdSectorId) : null } : {}),
      ...(b.packType !== undefined ? { packType: String(b.packType) } : {}),
      ...(b.packSize !== undefined ? { packSize: b.packSize === null || b.packSize === '' ? null : Number(b.packSize) } : {}),
      ...(b.active !== undefined ? { active: Boolean(b.active) } : {}),
    }, ctx)
    : b.action === 'addCodigo' ? await adicionarCodigo(user, id, String(b.code ?? ''), { principal: Boolean(b.principal) }, ctx)
    : b.action === 'removerCodigo' ? await removerCodigo(user, id, String(b.code ?? ''), ctx)
    : b.action === 'transferirCodigo' ? await transferirCodigo(user, String(b.code ?? ''), String(b.toProductId ?? ''), b.reason ? String(b.reason) : null, ctx)
    : b.action === 'revisarCodigo' ? await revisarCodigo(user, String(b.code ?? ''), ctx)
    : null;

  if (!r) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  if (!r.ok) return reasonResponse(RECUSAS, r.reason, r.message);
  return NextResponse.json({ ok: true });
}
