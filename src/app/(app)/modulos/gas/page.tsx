import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import Link from 'next/link';
import { getGasDashboard, listGasReceipts } from '@/lib/gas/query';
import { listSuppliers, canManageSuppliers } from '@/lib/suppliers';
import { Card, CardContent } from '@/components/ui/card';
import { GasClient, type GasDash, type GasRow } from '@/components/gas/gas-client';
import { Truck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function GasPage() {
  const user = (await getSessionUser())!;
  const canLaunch = ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN'].includes(user.role);

  const [units, suppliers, dash, receipts] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listSuppliers({ activeOnly: true }),
    getGasDashboard(user),
    listGasReceipts(user, { limit: 150 }),
  ]);

  const dashboard: GasDash = dash;
  const rows: GasRow[] = receipts.map((r) => ({
    id: r.id,
    date: r.operationalDate,
    unit: r.unit.name,
    supplier: r.supplier?.name ?? 'Sem fornecedor',
    qty: Number(r.quantityKg),
    total: Number(r.totalValue),
    price: Number(r.pricePerKg),
    variation: r.variationPct,
    alerted: r.alerted,
    by: r.createdBy?.name ?? '',
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-brand">Recebimento de Gás</h1>
          <p className="text-sm text-muted-foreground">Controle do preço real por kg, com comparativo entre unidades e fornecedores.</p>
        </div>
        {canManageSuppliers(user) && (
          <Link href="/configuracoes/fornecedores" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-accent"><Truck className="h-4 w-4" /> Fornecedores</Link>
        )}
      </div>
      <Card><CardContent className="pt-4">
        <GasClient
          canLaunch={canLaunch}
          isAdmin={user.role === 'ADMIN'}
          units={units}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, cnpj: s.cnpj }))}
          dashboard={dashboard}
          receipts={rows}
        />
      </CardContent></Card>
    </div>
  );
}
