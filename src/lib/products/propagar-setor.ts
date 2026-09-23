import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { notifyUsers } from '@/lib/notifications';

/**
 * Leva o setor do CADASTRO para os itens sem setor dos pedidos ABERTOS do CD.
 *
 * Módulo próprio, sem depender da ficha nem do catálogo, porque TODO caminho
 * que define setor num produto chama isto (ficha, mutirão, lote, cadastro
 * administrativo) — e um ciclo de imports entre eles é o tipo de coisa que
 * funciona até o dia em que não funciona.
 *
 * Só pedidos ABERTOS (ainda no CD). O que já saiu é retrato do dia e não muda:
 * reclassificar um item de pedido entregue reescreveria o romaneio que viajou.
 * Idempotente: item que já tem setor não é tocado.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };

/** Os status em que o pedido do CD ainda está no CD. */
export const STATUS_ABERTOS_NO_CD = ['ENVIADO_CD', 'SEPARANDO', 'PRONTO_ENVIO', 'CONFERIDO'] as const;

export async function propagarSetorParaItensAbertos(productIds: string[], ctx: Ctx = {}): Promise<number> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return 0;
  const produtos = await prisma.product.findMany({
    where: { id: { in: ids }, cdSectorId: { not: null } },
    select: { id: true, name: true, cdSectorId: true, cdSector: { select: { name: true } } },
  });
  let total = 0;
  const pedidosPorSetor = new Map<string, Set<string>>();
  for (const p of produtos) {
    if (!p.cdSectorId) continue;
    const afetados = await prisma.productRequestItem.findMany({
      where: { productId: p.id, cdSectorId: null, request: { origin: 'CD', status: { in: [...STATUS_ABERTOS_NO_CD] } } },
      select: { id: true, requestId: true },
    });
    if (afetados.length === 0) continue;
    const r = await prisma.productRequestItem.updateMany({
      where: { id: { in: afetados.map((a) => a.id) } },
      data: { cdSectorId: p.cdSectorId, cdSectorName: p.cdSector?.name ?? null },
    });
    total += r.count;
    const set = pedidosPorSetor.get(p.cdSectorId) ?? new Set<string>();
    for (const a of afetados) set.add(a.requestId);
    pedidosPorSetor.set(p.cdSectorId, set);
    await audit({
      userId: null, action: 'PRODUCT_ITEMS_RECLASSIFIED', module: 'PRODUCTS', entity: 'product', entityId: p.id,
      metadata: { produto: p.name, setor: p.cdSector?.name ?? null, itens: r.count, pedidos: set.size }, ...ctx,
    });
  }

  /* Avisa os separadores do setor que ganharam itens: o pedido pode ter
     chegado antes de o produto existir para eles. */
  for (const [sectorId, pedidos] of pedidosPorSetor) {
    const separadores = await prisma.user.findMany({ where: { active: true, role: 'SEPARATOR', cdSectorId: sectorId }, select: { id: true } });
    if (separadores.length === 0) continue;
    await notifyUsers(separadores.map((s) => s.id), {
      title: '📦 Itens entraram na sua fila',
      body: `Produto(s) recém-classificado(s) para o seu setor em ${pedidos.size} pedido(s) aberto(s).`,
      link: '/modulos/separacao', module: 'PRODUCTS',
    }).catch(() => {});
  }
  return total;
}
