import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { requestContext } from '@/lib/auth/service';
import { criarPedido } from '@/lib/products/pedido';
import { itensParaRepetir } from '@/lib/products/entrega';
import { soDigitos } from '@/lib/products/busca';
import { audit } from '@/lib/audit';

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
     O mesmo item chega com código diferente conforme a remessa. Associar é
     permanente e vale para a rede inteira, por isso fica atrás do direito de
     editar o catálogo — e não do direito de fazer pedido. */
  if (b.action === 'associarCodigo') {
    const { canEditModule } = await import('@/lib/permissions');
    if (!(await canEditModule(user.role, 'CONFIG_PRODUCTS'))) {
      return NextResponse.json({ error: 'Só quem edita o catálogo pode associar um código ao produto', reason: 'FORBIDDEN' }, { status: 403 });
    }
    const code = soDigitos(String(b.code ?? ''));
    const productId = String(b.productId ?? '');
    if (code.length < 6 || !productId) return NextResponse.json({ error: 'Código ou produto inválido' }, { status: 400 });

    const produto = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true } });
    if (!produto) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });

    /* Um código responde por UM produto. Se já pertence a outro, dizer de quem
       é vale mais do que recusar em silêncio — quase sempre é o cadastro do
       outro que está errado. */
    const existente = await prisma.productBarcode.findUnique({
      where: { code },
      select: { productId: true, product: { select: { name: true } } },
    });
    if (existente && existente.productId !== productId) {
      return NextResponse.json(
        { error: `Este código já pertence a "${existente.product.name}".`, reason: 'JA_USADO' },
        { status: 409 },
      );
    }
    if (existente) return NextResponse.json({ ok: true, jaExistia: true });

    await prisma.productBarcode.create({ data: { productId, code, createdById: user.id } });
    await audit({
      userId: user.id, action: 'PRODUCT_BARCODE_ADD', module: 'PRODUCTS',
      entity: 'product', entityId: productId, metadata: { produto: produto.name, code }, ...ctx,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
}
