import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listCertificates, getCertificatesReport } from '@/lib/certificates/query';
import { canSeeCid } from '@/lib/certificates/labels';
import { Card, CardContent } from '@/components/ui/card';
import { CertificatesClient } from '@/components/certificates/certificates-client';

export const dynamic = 'force-dynamic';

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default async function AtestadosPage({ searchParams }: { searchParams: { mes?: string } }) {
  const user = (await getSessionUser())!;
  const ym = searchParams.mes && /^\d{4}-\d{2}$/.test(searchParams.mes) ? searchParams.mes : currentYm();
  const canLaunch = ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN'].includes(user.role);
  const showCid = canSeeCid(user.role);

  const [units, collaborators, rows, report] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.collaborator.findMany({
      where: { active: true, units: { some: { unit: { active: true, ...unitScopeWhere(user, 'id') } } } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, units: { select: { unitId: true } } },
    }),
    listCertificates(user, {}),
    getCertificatesReport(user, ym),
  ]);

  // Colaboradores por unidade (para o picker filtrar conforme a unidade escolhida)
  const collaboratorsByUnit: Record<string, { id: string; name: string }[]> = {};
  for (const c of collaborators) {
    for (const u of c.units) {
      (collaboratorsByUnit[u.unitId] ??= []).push({ id: c.id, name: c.name });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-sgo-brand">Central de Atestados</h1>
        <p className="text-sm text-ink-500">Lance o atestado por foto (a IA lê e pré-preenche), acompanhe quantidade e dias por unidade.</p>
      </div>
      <Card><CardContent className="pt-4">
        <CertificatesClient
          canLaunch={canLaunch}
          isAdmin={user.role === 'ADMIN'}
          showCid={showCid}
          ym={ym}
          units={units}
          collaboratorsByUnit={collaboratorsByUnit}
          rows={rows}
          report={report}
        />
      </CardContent></Card>
    </div>
  );
}
