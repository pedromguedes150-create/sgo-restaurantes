import { getSessionUser } from '@/lib/auth/session';
import { canEditModule } from '@/lib/permissions';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listarAcoesDoAlcance } from '@/lib/supervisor/operacional';
import { LargeTitle } from '@/components/layout/page-chrome';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { PlanoDeAcaoClient } from '@/components/supervisor/plano-de-acao-client';
import { shortUnitName } from '@/lib/unit-name';

export const dynamic = 'force-dynamic';
const TODAS = 'todas';

/**
 * PLANO DE AÇÃO (v1.155.0) — as ações abertas nas visitas operacionais, para a
 * unidade acompanhar. Escopo por unidade no servidor; a validação é do
 * supervisor, presencial.
 */
export default async function PlanoDeAcaoPage({ searchParams }: { searchParams: { unidade?: string } }) {
  const user = (await getSessionUser())!;
  const unidades = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const unidade = searchParams.unidade && searchParams.unidade !== TODAS ? searchParams.unidade : null;
  const acoes = await listarAcoesDoAlcance(user, unidade);
  const pode = await canEditModule(user.role, 'VISIT_ACTIONS');

  return (
    <div className="space-y-4">
      <LargeTitle title="Plano de ação" subtitle="O que a supervisão apontou nas visitas. Informe o andamento; a supervisão valida no local." />
      {unidades.length > 1 && (
        <div className="sgo-filtros -mx-4">
          <span className="sgo-label">Unidade</span>
          <UnitSelectNav paramName="unidade" units={[{ id: TODAS, name: 'Todas as unidades' }, ...unidades.map((u) => ({ id: u.id, name: shortUnitName(u.name) }))]} selected={unidade ?? TODAS} />
        </div>
      )}
      <PlanoDeAcaoClient
        varias={unidades.length > 1}
        podeAtualizar={pode}
        acoes={acoes.map((a) => ({
          id: a.id, unidade: shortUnitName(a.unidade), problem: a.problem, category: a.category, responsibleName: a.responsibleName, dueDate: a.dueDate,
          gravity: a.gravity, situacao: a.situacao, status: a.status, photoPath: a.photoPath, note: a.note, unitNote: a.unitNote,
          createdByName: a.createdByName, createdAt: a.createdAt.toISOString(), validatedByName: a.validatedByName, validatedAt: a.validatedAt?.toISOString() ?? null, occurrenceId: a.occurrenceId,
        }))}
      />
    </div>
  );
}
