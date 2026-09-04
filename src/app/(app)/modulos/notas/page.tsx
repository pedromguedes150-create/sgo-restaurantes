import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';
import { permissaoDeRota } from '@/lib/permissions/links';
import { StatCard } from '@/components/ui/ds/stat-card';
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label="a pagar" value={summary.received} />
        <StatCard label="c/ problema" value={summary.problem} tone="danger" />
        <StatCard label="no mês" value={formatBRL(summary.monthValue)} className="col-span-2 sm:col-span-1" />
      </div>
      <Card>
        <CardContent className="pt-4">
          <NotesClient
            abas={await abasDoPerfil(user.role, 'NOTES')}
            podeGas={(await permissaoDeRota(user.role))('/modulos/notas/gas')}
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
              installments: n.installments.map((p) => ({
                seq: p.seq,
                dueDate: p.dueDate.toISOString().slice(0, 10),
                value: Number(p.value),
              })),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
