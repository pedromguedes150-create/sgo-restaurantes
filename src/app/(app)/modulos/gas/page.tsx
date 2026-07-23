import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import Link from 'next/link';
import { getGasDashboard, listGasReceipts } from '@/lib/gas/query';
import { listGasContracts, getGasPurchasedInFilter } from '@/lib/gas/contracts';
import { listSuppliers, canManageSuppliers } from '@/lib/suppliers';
import { Card, CardContent } from '@/components/ui/card';
import { GasClient, type GasDash, type GasRow } from '@/components/gas/gas-client';
import { Truck, TrendingUp } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function GasPage({ searchParams }: { searchParams: { unidade?: string; fornecedor?: string; mes?: string } }) {
  const user = (await getSessionUser())!;
  const canLaunch = ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN'].includes(user.role);
  // Filtros do dashboard (16/07): unidade/fornecedor/mês → total comprado no filtro
  const fUnit = searchParams.unidade || undefined;
  const fSupplier = searchParams.fornecedor || undefined;
  const fMes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? '') ? searchParams.mes : undefined;

  const [units, suppliers, dash, receipts, contracts, purchased] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listSuppliers({ activeOnly: true }),
    getGasDashboard(user, { unitId: fUnit, supplierId: fSupplier, yearMonth: fMes }),
    listGasReceipts(user, { limit: 300 }),
    listGasContracts(user),
    getGasPurchasedInFilter(user, { unitId: fUnit, supplierId: fSupplier, yearMonth: fMes }),
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
    dateEdited: r.dateEdited,
    dateEditedByName: r.dateEditedByName,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-brand">Recebimento de Gás</h1>
          <p className="text-sm text-muted-foreground">Controle do preço real por kg, com comparativo entre unidades e fornecedores.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/modulos/gas/relatorio" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-accent"><TrendingUp className="h-4 w-4" /> Relatório de variação</Link>
          {canManageSuppliers(user) && (
            <Link href="/configuracoes/fornecedores" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-accent"><Truck className="h-4 w-4" /> Fornecedores</Link>
          )}
        </div>
      </div>
      <Card><CardContent className="pt-4">
        <GasClient
          canLaunch={canLaunch}
          isAdmin={user.role === 'ADMIN'}
          canEditDate={user.role === 'ADMIN' || user.role === 'SUPERVISOR'}
          units={units}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, cnpj: s.cnpj }))}
          dashboard={dashboard}
          receipts={rows}
          contracts={contracts}
          purchased={purchased}
          canManageContracts={user.role === 'SUPERVISOR' || user.role === 'ADMIN' || user.role === 'CEO'}
          filter={{ unitId: fUnit ?? '', supplierId: fSupplier ?? '', mes: fMes ?? '' }}
        />
      </CardContent></Card>
    </div>
  );
}
