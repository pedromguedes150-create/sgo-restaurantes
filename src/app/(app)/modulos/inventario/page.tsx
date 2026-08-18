import { getSessionUser } from '@/lib/auth/session';
import { FamilyTabs } from '@/components/layout/family-tabs';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listInventory } from '@/lib/inventory';
import { listEquipItems, listEquipMovements, getEquipSummary, canEditEquip } from '@/lib/inventory-equip';
import { listSuppliers } from '@/lib/suppliers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InventoryClient } from '@/components/inventory/inventory-client';
import { EquipmentInventory } from '@/components/inventory/equipment-inventory';
import { ClipboardList, Wrench } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function InventarioPage() {
  const user = (await getSessionUser())!;
  const [items, units, equipItems, equipMoves, equipSummary, suppliers] = await Promise.all([
    listInventory(user),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listEquipItems(user),
    listEquipMovements(user, { limit: 100 }),
    getEquipSummary(user),
    listSuppliers({ activeOnly: true }),
  ]);

  return (
    <div className="space-y-5">
      <LargeTitle title="Inventário" />
      <FamilyTabs active="/modulos/inventario" />

      {/* Seção 1: inventário do Teknisa (acompanhamento da tarefa) */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-5 w-5 text-brand" /> Inventário Teknisa (tarefa do gerente)</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-ink-500">O inventário detalhado é feito no Teknisa; aqui acompanhamos a execução da tarefa e fazemos a conferência.</p>
          <InventoryClient
            isAdmin={user.role === 'ADMIN'}
            units={units}
            items={items.map((i) => ({ id: i.id, unit: i.unit.name, category: i.categoryName, date: i.scheduledDate, responsible: i.responsible?.name ?? null, status: i.status, confirmedBy: i.confirmedBy?.name ?? null }))}
          />
        </CardContent>
      </Card>

      {/* Seção 2: inventário de equipamentos (fora do Teknisa) */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-5 w-5 text-brand" /> Inventário de Equipamentos</CardTitle></CardHeader>
        <CardContent>
          <EquipmentInventory
            canEdit={canEditEquip(user)}
            isAdmin={user.role === 'ADMIN'}
            units={units}
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
            items={equipItems}
            movements={equipMoves}
            summary={equipSummary}
          />
        </CardContent>
      </Card>
    </div>
  );
}
