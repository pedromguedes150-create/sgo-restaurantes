import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listNotes, getNoteSummary } from '@/lib/notes/query';
import { listSuppliers } from '@/lib/suppliers';
import { getGasDashboard, listGasReceipts } from '@/lib/gas/query';
import { listGasContracts, getGasPurchasedInFilter } from '@/lib/gas/contracts';
import { isSupervisory } from '@/lib/roles';
import { Card, CardContent } from '@/components/ui/card';
import { NotesClient } from '@/components/notes/notes-client';
import { formatBRL } from '@/lib/utils';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function NotasPage({ searchParams }: { searchParams: { dias?: string; unidade?: string; fornecedor?: string; mes?: string } }) {
  const user = (await getSessionUser())!;
  const ym = new Date().toISOString().slice(0, 7);
  const sinceDays = [60, 90, 180, 365].includes(Number(searchParams.dias)) ? Number(searchParams.dias) : 60;
  // Filtros da aba "Análise de gás"
  const fUnit = searchParams.unidade || undefined;
  const fSupplier = searchParams.fornecedor || undefined;
  const fMes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? '') ? searchParams.mes : undefined;

  const [notes, summary, units, suppliers, gasDash, gasReceipts, gasContracts, gasPurchased] = await Promise.all([
    listNotes(user, undefined, sinceDays),
    getNoteSummary(user, ym),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listSuppliers({ activeOnly: true }),
    getGasDashboard(user, { unitId: fUnit, supplierId: fSupplier, yearMonth: fMes }),
    listGasReceipts(user, { limit: 300 }),
    listGasContracts(user),
    getGasPurchasedInFilter(user, { unitId: fUnit, supplierId: fSupplier, yearMonth: fMes }),
  ]);

  const canManage = user.role === 'SUPERVISOR' || user.role === 'ADMIN' || user.role === 'CEO';
  const canLaunch = ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN'].includes(user.role);

  return (
    <div className="space-y-5">
      <LargeTitle title="Notas Recebidas" />
      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-ink-900">{summary.received}</p><p className="text-xs text-ink-500">a pagar</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-danger">{summary.problem}</p><p className="text-xs text-ink-500">c/ problema</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-base font-black text-ink-900">{formatBRL(summary.monthValue)}</p><p className="text-xs text-ink-500">no mês</p></CardContent></Card>
      </div>
      <Card>
        <CardContent className="pt-4">
          <NotesClient
            canManage={canManage}
            canEditDate={user.role === 'SUPERVISOR' || user.role === 'ADMIN'}
            sinceDays={sinceDays}
            units={units}
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, cnpj: s.cnpj, isGas: s.isGas }))}
            notes={notes.map((n) => ({
              id: n.id, unit: n.unit.name, supplier: n.supplierName, value: Number(n.totalValue), status: n.status, number: n.number, problemNote: n.problemNote,
              cnpj: n.supplierCnpj ?? '', issueDate: n.issueDate ? new Date(n.issueDate).toISOString().slice(0, 10) : '', dueDate: n.dueDate ? new Date(n.dueDate).toISOString().slice(0, 10) : '', productType: n.productType ?? '', observation: n.observation ?? '',
              requestedAt: n.createdAt.toISOString(), entryDate: n.entryDate ? n.entryDate.toISOString() : null, dateEdited: n.dateEdited, dateEditedByName: n.dateEditedByName,
              supervisorLaunched: n.supervisorLaunched, createdByName: n.createdBy?.name ?? '',
            }))}
            gas={{
              canLaunch,
              isAdmin: user.role === 'ADMIN',
              canEditDate: user.role === 'ADMIN' || user.role === 'SUPERVISOR',
              canManageContracts: isSupervisory(user.role) || user.role === 'CEO',
              dashboard: gasDash,
              purchased: gasPurchased,
              filter: { unitId: fUnit ?? '', supplierId: fSupplier ?? '', mes: fMes ?? '' },
              receipts: gasReceipts.map((r) => ({
                id: r.id, date: r.operationalDate, unit: r.unit.name, supplier: r.supplier?.name ?? 'Sem fornecedor',
                qty: Number(r.quantityKg), total: Number(r.totalValue), price: Number(r.pricePerKg), variation: r.variationPct, alerted: r.alerted,
                by: r.createdBy?.name ?? '', dateEdited: r.dateEdited, dateEditedByName: r.dateEditedByName,
              })),
              contracts: gasContracts,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
