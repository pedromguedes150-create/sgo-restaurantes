import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';

import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listTerminations, TIPOS_DESLIGAMENTO, MODALIDADES_AVISO, MOTIVOS_DESLIGAMENTO } from '@/lib/terminations';
import { rotuloDaSituacao } from '@/lib/rh/saida/regras';
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

  const label = <T extends string>(lista: { value: T; label: string }[], v: T | null) => (v ? lista.find((o) => o.value === v)?.label ?? v : null);
  const rows: TermRow[] = terms.map((t) => ({
    id: t.id, collaboratorName: t.collaboratorName, unit: t.unit.name, noticeType: t.noticeType,
    status: t.status, by: t.requestedBy?.name ?? null, reason: t.reason,
    tenureText: t.tenureText, ageYears: t.ageYears, certCount: t.certCount, certDays: t.certDays, rejectionReason: t.rejectionReason,
    tipoLabel: label(TIPOS_DESLIGAMENTO, t.terminationKind)?.replace(' (carta obrigatória)', '') ?? null,
    avisoLabel: label(MODALIDADES_AVISO, t.noticeMode), motivoLabel: label(MOTIVOS_DESLIGAMENTO, t.reasonCode)?.replace(' (justificar)', '') ?? null,
    terminationDate: t.terminationDate, temCarta: Boolean(t.letterPath),
    envio: t.envio, rhProcesso: t.rhProcesso, rhPrazoLegal: t.rhPrazoLegal,
    situacaoRotulo: t.envio === 'ENVIADO' ? rotuloDaSituacao(t.rhSituacao) : null,
  }));
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  return (
    <div className="space-y-4">
      <TerminationsClient
        subtitulo="Solicitação do gerente → aprovação do supervisor → enviado ao RH automaticamente (v1.168.0), com o andamento aqui."
        abas={await abasDoPerfil(user.role, 'TERMINATIONS')}
        canRequest={canRequest} canDecide={canDecide} units={units} collaboratorsByUnit={collaboratorsByUnit} rows={rows}
        tipos={TIPOS_DESLIGAMENTO} modalidades={MODALIDADES_AVISO} motivos={MOTIVOS_DESLIGAMENTO} hoje={hoje}
      />
    </div>
  );
}
