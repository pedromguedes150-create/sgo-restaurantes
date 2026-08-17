import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listActiveProducts, listUnitRequests, listIncomingRequests } from '@/lib/products';
import { Card, CardContent } from '@/components/ui/card';
import { ProductsClient } from '@/components/products/products-client';
import { PackagePlus } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function ProdutosPage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade vinculada.</p>;
  const selUnit = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const isOps = ['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role);

  const [products, myRequests, incoming] = await Promise.all([
    listActiveProducts(),
    listUnitRequests(user, selUnit.id),
    isOps ? listIncomingRequests(user) : Promise.resolve([]),
  ]);

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
        <p className="text-sm text-ink-500">Peça à <b>Fábrica</b> e ao <b>Centro de Distribuição</b> num pedido só — o sistema separa por destino.</p>
      </div>
      <Card><CardContent className="pt-4">
        <ProductsClient
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
