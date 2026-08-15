import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listTerminations } from '@/lib/terminations';
import { Card, CardContent } from '@/components/ui/card';
import { TerminationsClient, type TermRow } from '@/components/terminations/terminations-client';

export const dynamic = 'force-dynamic';

export default async function DesligamentosPage() {
  const user = (await getSessionUser())!;
  const canRequest = ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN'].includes(user.role);
  const canDecide = ['SUPERVISOR', 'ADMIN', 'CEO'].includes(user.role);

  const [units, collaborators, terms] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.collaborator.findMany({ where: { active: true, units: { some: { unit: { active: true, ...unitScopeWhere(user, 'id') } } } }, orderBy: { name: 'asc' }, select: { id: true, name: true, units: { select: { unitId: true } } } }),
    listTerminations(user),
  ]);

  const collaboratorsByUnit: Record<string, { id: string; name: string }[]> = {};
  for (const c of collaborators) for (const u of c.units) (collaboratorsByUnit[u.unitId] ??= []).push({ id: c.id, name: c.name });

  const rows: TermRow[] = terms.map((t) => ({
    id: t.id, collaboratorName: t.collaboratorName, unit: t.unit.name, noticeType: t.noticeType,
    status: t.status, by: t.requestedBy?.name ?? null, reason: t.reason,
    tenureText: t.tenureText, ageYears: t.ageYears, certCount: t.certCount, certDays: t.certDays, rejectionReason: t.rejectionReason,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-sgo-brand">Desligamentos</h1>
        <p className="text-sm text-ink-500">Solicitação do gerente → aprovação do supervisor → encaminhar ao RH.</p>
      </div>
      <Card><CardContent className="pt-4">
        <TerminationsClient canRequest={canRequest} canDecide={canDecide} units={units} collaboratorsByUnit={collaboratorsByUnit} rows={rows} />
      </CardContent></Card>
    </div>
  );
}
