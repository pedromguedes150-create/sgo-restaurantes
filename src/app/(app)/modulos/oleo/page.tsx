import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getOilDashboard, listOilCollections } from '@/lib/oil/query';
import { listSuppliers } from '@/lib/suppliers';
import { Card, CardContent } from '@/components/ui/card';
import { OilClient, type OilDash, type OilRow } from '@/components/oil/oil-client';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function OleoPage() {
  const user = (await getSessionUser())!;
  const canLaunch = ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN'].includes(user.role);

  const [units, suppliers, dash, rows] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listSuppliers({ activeOnly: true }),
    getOilDashboard(user),
    listOilCollections(user, { limit: 150 }),
  ]);

  const dashboard: OilDash = dash;
  const list: OilRow[] = rows.map((r) => ({
    id: r.id, date: r.operationalDate, unit: r.unit.name, supplier: r.supplier?.name ?? 'Sem fornecedor',
    liters: Number(r.liters), price: Number(r.pricePerLiter), total: Number(r.totalValue), method: r.paymentMethod ?? '', by: r.createdBy?.name ?? '',
    dateEdited: r.dateEdited, dateEditedByName: r.dateEditedByName,
  }));

  return (
    <div className="space-y-5">
      <div>
        <LargeTitle title="Coleta de Óleo" subtitle="Controle da coleta de óleo usado (recebemos por ela): litros, valor/litro, total e forma de recebimento." />
      </div>
      <Card><CardContent className="pt-4">
        <OilClient
          canLaunch={canLaunch}
          isAdmin={user.role === 'ADMIN'}
          canEditDate={user.role === 'ADMIN' || user.role === 'SUPERVISOR'}
          units={units}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          dashboard={dashboard}
          rows={list}
        />
      </CardContent></Card>
    </div>
  );
}
