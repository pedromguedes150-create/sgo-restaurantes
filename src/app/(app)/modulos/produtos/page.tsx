import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';

import { FamilyTabs } from '@/components/layout/family-tabs';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listActiveProducts, listUnitRequests, listIncomingRequests } from '@/lib/products';
import { Card, CardContent } from '@/components/ui/card';
import { ProductsClient } from '@/components/products/products-client';
import { PedidoClient } from '@/components/products/pedido-client';
import { sugerirProdutos } from '@/lib/products/sugestoes';
import { listarPedidosDaUnidade } from '@/lib/products/pedido';
import { numeroDoPedido } from '@/lib/products/numero-do-pedido';
import { canEditModule } from '@/lib/permissions';
import { PackagePlus } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function ProdutosPage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade vinculada.</p>;
  const selUnit = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const isOps = ['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role);

  const [products, myRequests, incoming, sugestoes, recentes, podeAssociarCodigo, comCodigos] = await Promise.all([
    listActiveProducts(),
    listUnitRequests(user, selUnit.id),
    isOps ? listIncomingRequests(user) : Promise.resolve([]),
    sugerirProdutos(user, selUnit.id),
    listarPedidosDaUnidade(user, selUnit.id, 5),
    /* Associar codigo e permanente e vale para a rede inteira — fica com quem
       edita o catalogo, nao com quem faz pedido. */
    canEditModule(user.role, 'CONFIG_PRODUCTS'),
    /* Os codigos ALTERNATIVOS de cada produto: sem eles, bipar a caixa da
       remessa nova cairia no "codigo nao reconhecido" todas as vezes. */
    prisma.productBarcode.findMany({ select: { productId: true, code: true } }),
  ]);

  const codigosPorProduto = new Map<string, string[]>();
  for (const b of comCodigos) {
    codigosPorProduto.set(b.productId, [...(codigosPorProduto.get(b.productId) ?? []), b.code]);
  }

  const serReq = (r: { id: string; unitId: string; origin: string; number: number; status: string; createdByName: string; note: string | null; items: unknown; createdAt: Date }) => ({
    id: r.id, origin: r.origin, number: r.number, status: r.status, createdByName: r.createdByName, note: r.note,
    createdAt: r.createdAt.toISOString(),
    items: (r.items as { name: string; category: string; measure: string; qty: number }[]) ?? [],
  });

  const unitNameById = Object.fromEntries(units.map((u) => [u.id, u.name]));

  return (
    <div className="space-y-4">
      <div>
        <LargeTitle title="Solicitação de Produtos" />
        <FamilyTabs active="/modulos/produtos" />
        <p className="text-sm text-ink-500">Peça à <b>Fábrica</b> e ao <b>Centro de Distribuição</b> num pedido só — o sistema separa por destino.</p>
      </div>
      <Card><CardContent className="pt-4">
        <PedidoClient
          unitId={selUnit.id}
          unitName={selUnit.name}
          podeAssociarCodigo={podeAssociarCodigo}
          produtos={products.map((p) => ({
            id: p.id, name: p.name, category: p.category, measure: p.measure,
            packSize: p.packSize, barcode: p.barcode,
            barcodes: codigosPorProduto.get(p.id) ?? [],
          }))}
          sugestoes={sugestoes.map((s) => ({
            productId: s.productId, name: s.name, measure: s.measure,
            qtySugerida: s.qtySugerida, ultimas: s.ultimas, vezes: s.vezes,
          }))}
          recentes={recentes.map((r) => ({
            id: r.id, number: r.number, etiqueta: numeroDoPedido(r.number, r.createdAt),
            statusLabel: r.statusLabel, itens: r.itens, separados: r.separados, emAndamento: r.emAndamento,
            quando: r.createdAt.toLocaleDateString('pt-BR'),
          }))}
        />
      </CardContent></Card>

      <Card><CardContent className="pt-4">
        <ProductsClient
            abas={await abasDoPerfil(user.role, 'PRODUCTS')}
          units={units}
          selUnitId={selUnit.id}
          isOps={isOps}
          products={products.map((p) => ({ id: p.id, name: p.name, origin: p.origin, category: p.category, measure: p.measure }))}
          myRequests={myRequests.map(serReq)}
          incoming={incoming.map((r) => ({ ...serReq(r), unitName: unitNameById[r.unitId] ?? '—' }))}
        />
      </CardContent></Card>
    </div>
  );
}
