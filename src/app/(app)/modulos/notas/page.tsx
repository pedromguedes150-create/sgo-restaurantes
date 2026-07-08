import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listNotes, getNoteSummary } from '@/lib/notes/query';
import { listSuppliers } from '@/lib/suppliers';
import { Card, CardContent } from '@/components/ui/card';
import { NotesClient } from '@/components/notes/notes-client';
import { formatBRL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function NotasPage() {
  const user = (await getSessionUser())!;
  const ym = new Date().toISOString().slice(0, 7);
  const [notes, summary, units, suppliers] = await Promise.all([
    listNotes(user),
    getNoteSummary(user, ym),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listSuppliers({ activeOnly: true }),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand">Notas Recebidas</h1>
      <div className="grid grid-cols-3 gap-2">
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-brand">{summary.received}</p><p className="text-xs text-muted-foreground">a pagar</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-2xl font-black text-critical">{summary.problem}</p><p className="text-xs text-muted-foreground">c/ problema</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-base font-black text-brand">{formatBRL(summary.monthValue)}</p><p className="text-xs text-muted-foreground">no mês</p></CardContent></Card>
      </div>
      <Card>
        <CardContent className="pt-4">
          <NotesClient
            canManage={user.role === 'SUPERVISOR' || user.role === 'ADMIN' || user.role === 'CEO'}
            canEditDate={user.role === 'SUPERVISOR' || user.role === 'ADMIN'}
            units={units}
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, cnpj: s.cnpj }))}
            notes={notes.map((n) => ({
              id: n.id, unit: n.unit.name, supplier: n.supplierName, value: Number(n.totalValue), status: n.status, number: n.number, problemNote: n.problemNote,
              cnpj: n.supplierCnpj ?? '', issueDate: n.issueDate ? new Date(n.issueDate).toISOString().slice(0, 10) : '', dueDate: n.dueDate ? new Date(n.dueDate).toISOString().slice(0, 10) : '', productType: n.productType ?? '', observation: n.observation ?? '',
              requestedAt: n.createdAt.toISOString(), entryDate: n.entryDate ? n.entryDate.toISOString() : null, dateEdited: n.dateEdited, dateEditedByName: n.dateEditedByName,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
