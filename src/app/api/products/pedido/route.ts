import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { requestContext } from '@/lib/auth/service';
import { criarPedido } from '@/lib/products/pedido';
import { itensParaRepetir } from '@/lib/products/entrega';
import { cadastrarProvisorio, duplicadosProvaveis, vincularCodigoPeloPedido } from '@/lib/products/cadastro-provisorio';

/**
 * Pedidos Internos — criação do pedido e associação de código de barras.
 *
 * A matriz decide o perfil (`PRODUCTS` com Editar) e `criarPedido` decide o
 * escopo: mesmo com o perfil certo, ninguém pede para unidade que não enxerga.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  /* ── Criar o pedido ── */
  if (b.action === 'criar') {
    const r = await criarPedido(user, {
      unitId: String(b.unitId ?? ''),
      items: Array.isArray(b.items)
        ? b.items.map((i: { productId?: unknown; qty?: unknown }) => ({ productId: String(i.productId ?? ''), qty: Number(i.qty) }))
        : [],
      note: b.note,
    }, ctx);
    if (!r.ok) {
      const status: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, NAO_ENCONTRADO: 404 };
      return NextResponse.json({ error: r.detalhe ?? 'Não foi possível enviar o pedido', reason: r.reason }, { status: status[r.reason] ?? 400 });
    }
    return NextResponse.json({ ok: true, pedidos: r.pedidos, semSetor: r.semSetor });
  }

  /* ── Repetir um pedido antigo ──
     Todo mês a unidade pede quase a mesma coisa, e redigitar trinta linhas é o
     que faz o pedido sair errado. Isto devolve os itens para o carrinho: o
     gerente ainda revisa e envia, nada é mandado sozinho. */
  if (b.action === 'repetir') {
    const r = await itensParaRepetir(user, String(b.id ?? ''));
    if (!r.ok) {
      return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Pedido não encontrado' }, { status: r.reason === 'FORBIDDEN' ? 403 : 404 });
    }
    return NextResponse.json({ ok: true, itens: r.itens, ignorados: r.ignorados });
  }

  /* ── Associar um código de barras a um produto ──
     PERMANENTE e para a rede inteira — e agora pelo GERENTE, que está com a
     embalagem na mão. Antes exigia o direito de editar o catálogo, e o código
     caía em "não reconhecido" em todo pedido seguinte; era assim que nasciam os
     cadastros duplicados. O que protege o catálogo é a regra (um código, um
     produto) e a Auditoria — não o perfil. Ver cadastro-provisorio.ts. */
  if (b.action === 'associarCodigo') {
    const r = await vincularCodigoPeloPedido(user, String(b.productId ?? ''), String(b.code ?? ''), ctx);
    if (!r.ok) {
      const status: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, NAO_ENCONTRADO: 404, JA_USADO: 409 };
      const msg = r.message ?? (r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NAO_ENCONTRADO' ? 'Produto não encontrado' : 'Código ou produto inválido');
      return NextResponse.json({ error: msg, reason: r.reason }, { status: status[r.reason] ?? 400 });
    }
    return NextResponse.json({ ok: true, jaExistia: r.jaExistia, produto: r.produto });
  }

  /* ── Possíveis duplicados, antes de criar um produto novo ── */
  if (b.action === 'duplicados') {
    const lista = await duplicadosProvaveis(String(b.nome ?? ''));
    return NextResponse.json({ ok: true, duplicados: lista.map((d) => ({ ...d.produto, grau: d.grau })) });
  }

  /* ── Cadastro PROVISÓRIO pelo gerente: entra no pedido, valida-se depois ── */
  if (b.action === 'cadastrarProvisorio') {
    const r = await cadastrarProvisorio(user, {
      name: String(b.nome ?? ''), codigo: b.codigo ? String(b.codigo) : null,
      packType: b.packType ? String(b.packType) : 'UN',
      packSize: b.packSize === undefined || b.packSize === null ? null : Number(b.packSize),
    }, ctx);
    if (!r.ok) {
      const status: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, JA_VINCULADO: 409 };
      return NextResponse.json({ error: r.message ?? 'Não foi possível cadastrar', reason: r.reason }, { status: status[r.reason] ?? 400 });
    }
    return NextResponse.json({ ok: true, produto: r.produto });
  }

  return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
}
