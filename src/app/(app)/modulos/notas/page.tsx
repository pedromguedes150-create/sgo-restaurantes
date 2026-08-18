import { getSessionUser } from '@/lib/auth/session';
import { FamilyTabs } from '@/components/layout/family-tabs';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listNotes, getNoteSummary } from '@/lib/notes/query';
import { listSuppliers } from '@/lib/suppliers';
import { Card, CardContent } from '@/components/ui/card';
import { NotesClient } from '@/components/notes/notes-client';
import { formatBRL } from '@/lib/utils';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function NotasPage({ searchParams }: { searchParams: { dias?: string; aba?: string } }) {
  const user = (await getSessionUser())!;
  const ym = new Date().toISOString().slice(0, 7);
  const sinceDays = [60, 90, 180, 365].includes(Number(searchParams.dias)) ? Number(searchParams.dias) : 60;
  const aba = searchParams.aba === 'venc' ? 'venc' : 'lista';

  /* Os dados de GÁS saíram daqui: viviam nesta consulta e eram buscados em
     TODA visita — dashboard, contratos e 300 recebimentos — inclusive de quem
     só queria conferir uma nota. Agora moram em /modulos/notas/gas. */
  const [notes, summary, units, suppliers] = await Promise.all([
    listNotes(user, undefined, sinceDays),
    getNoteSummary(user, ym),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listSuppliers({ activeOnly: true }),
  ]);

  const canManage = user.role === 'SUPERVISOR' || user.role === 'ADMIN' || user.role === 'CEO';

  return (
    <div className="space-y-5">
      <LargeTitle title="Notas Recebidas" />
      <FamilyTabs active="/modulos/notas" />
      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-ink-900">{summary.received}</p><p className="text-xs text-ink-500">a pagar</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-danger">{summary.problem}</p><p className="text-xs text-ink-500">c/ problema</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-base font-black text-ink-900">{formatBRL(summary.monthValue)}</p><p className="text-xs text-ink-500">no mês</p></CardContent></Card>
      </div>
      <Card>
        <CardContent className="pt-4">
          <NotesClient
            aba={aba}
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
          />
        </CardContent>
      </Card>
    </div>
  );
}
