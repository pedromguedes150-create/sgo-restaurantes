import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listInventory } from '@/lib/inventory';
import { Card, CardContent } from '@/components/ui/card';
import { InventoryClient } from '@/components/inventory/inventory-client';

export const dynamic = 'force-dynamic';

export default async function InventarioPage() {
  const user = (await getSessionUser())!;
  const [items, units] = await Promise.all([
    listInventory(user),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-brand">Inventário</h1>
      <p className="text-sm text-muted-foreground">Registro de execução (o controle detalhado dos itens permanece no Teknisa).</p>
      <Card>
        <CardContent className="pt-4">
          <InventoryClient
            isAdmin={user.role === 'ADMIN'}
            units={units}
            items={items.map((i) => ({ id: i.id, unit: i.unit.name, category: i.categoryName, date: i.scheduledDate, responsible: i.responsible?.name ?? null, status: i.status, confirmedBy: i.confirmedBy?.name ?? null }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
