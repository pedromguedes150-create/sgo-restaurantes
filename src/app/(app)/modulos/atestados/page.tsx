import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';

import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listCertificates, getCertificatesReport } from '@/lib/certificates/query';
import { canSeeCid } from '@/lib/certificates/labels';
import { CertificatesClient } from '@/components/certificates/certificates-client';
import { getAuditoriaDeAtestados } from '@/lib/certificates/auditoria';
import { podeAuditar, podeJustificar } from '@/lib/certificates/auditoria-regras';
import { podeAba } from '@/lib/permissions/abas';

export const dynamic = 'force-dynamic';

function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default async function AtestadosPage({ searchParams }: { searchParams: { mes?: string; aba?: string; unit?: string; doc?: string } }) {
  const user = (await getSessionUser())!;
  const ym = searchParams.mes && /^\d{4}-\d{2}$/.test(searchParams.mes) ? searchParams.mes : currentYm();
  const abas = await abasDoPerfil(user.role, 'CERTIFICATES');
  const canLaunch = ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN'].includes(user.role);
  const showCid = canSeeCid(user.role);

  /* v1.181.0 — a auditoria dos lançamentos: só quando a aba está aberta para o perfil; o filtro de unidade da URL entra em AND com o escopo. */
  const unitFiltro = searchParams.unit ?? '';
  const auditoriaAberta = podeAba(abas, 'auditoria');
  const [units, collaborators, rows, report, auditoria] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.collaborator.findMany({
      where: { active: true, units: { some: { unit: { active: true, ...unitScopeWhere(user, 'id') } } } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, units: { select: { unitId: true } } },
    }),
    listCertificates(user, {}),
    getCertificatesReport(user, ym),
    auditoriaAberta ? getAuditoriaDeAtestados(user, ym, unitFiltro || undefined) : Promise.resolve(null),
  ]);
  const unidadeNoAlcance = !unitFiltro || units.some((u) => u.id === unitFiltro);

  // Colaboradores por unidade (para o picker filtrar conforme a unidade escolhida)
  const collaboratorsByUnit: Record<string, { id: string; name: string }[]> = {};
  for (const c of collaborators) {
    for (const u of c.units) {
      (collaboratorsByUnit[u.unitId] ??= []).push({ id: c.id, name: c.name });
    }
  }

  return (
    <div className="space-y-4">
      {/* O cabeçalho (título + abas) vive no cliente, no padrão do kit. */}
      <CertificatesClient
        subtitulo="Atestados, afastamentos, comparecimentos e licenças: escolha o colaborador, fotografe o documento e envie — a IA lê e classifica, o RH valida."
        abas={abas}
        auditoria={auditoria && unidadeNoAlcance ? { dados: auditoria, podeInformar: podeAuditar(user.role) && abas.auditoria?.canEdit !== false, podeJustificar: podeJustificar(user.role) } : null}
        abaPedida={searchParams.aba}
        docPedido={searchParams.doc && /^[a-z0-9]+$/i.test(searchParams.doc) ? searchParams.doc : undefined}
        unitFiltro={unidadeNoAlcance ? unitFiltro : ''}
        canLaunch={canLaunch}
        isAdmin={user.role === 'ADMIN'}
        showCid={showCid}
        ym={ym}
        units={units}
        collaboratorsByUnit={collaboratorsByUnit}
        rows={rows}
        report={report}
      />
    </div>
  );
}
