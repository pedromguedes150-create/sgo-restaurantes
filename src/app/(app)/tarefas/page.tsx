import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { permissaoDeRota } from '@/lib/permissions/links';

import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { resolveUnitFilter, TODAS_AS_UNIDADES } from '@/lib/scope/unit-filter';
import { getSelectedUnitId } from '@/lib/scope/selected-unit';
import { getTasksTodayForUser } from '@/lib/tasks/query';
import { leaveOnDate } from '@/lib/manager-area';
import { TaskItem, type TaskItemData } from '@/components/tasks/task-item';
import { UnitTasksSection } from '@/components/tasks/unit-tasks-section';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Banner } from '@/components/ui/ds/banner';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { shortUnitName } from '@/lib/unit-name';
import { Building2 } from 'lucide-react';
import { AutoRefresh } from '@/components/layout/auto-refresh';

export const dynamic = 'force-dynamic';

// Módulos já implementados: a tarefa abre o módulo em vez de concluir inline.
const MODULE_HREFS: Partial<Record<string, string>> = {
  WASTE: '/modulos/desperdicios',
  OCCURRENCES: '/modulos/ocorrencias/nova',
  COMMANDS: '/modulos/comandas',
  CANCELLATIONS: '/modulos/cancelamentos',
};

export default async function TarefasPage({ searchParams }: { searchParams: { filter?: string; unit?: string; unidade?: string } }) {
  const user = (await getSessionUser())!;
  const podeVer = await permissaoDeRota(user.role);
  const now = new Date();
  // Folga/férias do gerente: nesses dias os checklists não aparecem para ele.
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const leave = await leaveOnDate(user.id, todayISO);

  // Filtro de unidade vindo do dashboard (?unit=<id>). Validado contra as unidades
  // acessíveis — escopo por unit_id sempre no servidor (regra nº 3).
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  /* A tela OBEDECE o seletor de unidade do cabeçalho. Antes lia só `?unit=`
     (os atalhos do Dashboard): o chip dizia "Moreira" e a lista mostrava a rede
     inteira. Para ver todas de uma vez existe o link "Ver todas as unidades",
     que manda `?unit=todas` — explícito, e vence o seletor. */
  const unitFilter = resolveUnitFilter(searchParams, units.map((u) => u.id), getSelectedUnitId(units.map((u) => u.id)));
  const requestedUnits = (searchParams.unit ?? '').split(',').map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== TODAS_AS_UNIDADES);
  const unitDenied = requestedUnits.length > 0 && !requestedUnits.some((id) => units.some((u) => u.id === id));
  const filteredNames = unitFilter.all ? [] : units.filter((u) => unitFilter.ids.includes(u.id)).map((u) => u.name);

  const groups = leave ? [] : await getTasksTodayForUser(user, now, unitFilter.all ? undefined : unitFilter.ids);
  const onlyOverdue = searchParams.filter === 'atrasadas';
  // Mantém a unidade selecionada ao navegar entre as telas de tarefas.
  const withUnit = (path: string) => (unitFilter.all ? path : `${path}${path.includes('?') ? '&' : '?'}unit=${unitFilter.ids.join(',')}`);
  const isOverdueTask = (t: (typeof groups)[number]['tasks'][number]) => t.status === 'PENDING' && t.dueAt < now;
  const overdueCount = groups.reduce((s, g) => s + g.tasks.filter(isOverdueTask).length, 0);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />
      <LargeTitle
        title={onlyOverdue ? 'Tarefas atrasadas' : 'Tarefas de hoje'}
        subtitle={
          filteredNames.length > 0
            ? `Unidade: ${filteredNames.map(shortUnitName).join(', ')}`
            : units.length > 1 ? 'Todas as unidades' : undefined
        }
        actions={
          onlyOverdue ? (
            <Link href={withUnit('/tarefas')} className="text-sm font-semibold text-brand hover:underline">Ver todas</Link>
          ) : (
            <span className="flex gap-4">
              {podeVer('/tarefas/correcoes') && <Link href={withUnit('/tarefas/correcoes')} className="text-sm font-semibold text-brand hover:underline">Correções do dia</Link>}
              {podeVer('/tarefas/historico') && <Link href={withUnit('/tarefas/historico')} className="text-sm font-semibold text-brand hover:underline">Histórico</Link>}
            </span>
          )
        }
      />

      {filteredNames.length > 0 && units.length > 1 && (
        <Link
          href={onlyOverdue ? `/tarefas?filter=atrasadas&unit=${TODAS_AS_UNIDADES}` : `/tarefas?unit=${TODAS_AS_UNIDADES}`}
          className="inline-block text-xs font-semibold text-brand hover:underline"
        >
          Ver todas as unidades
        </Link>
      )}

      {unitDenied && (
        <Banner tone="warning" title="Unidade não encontrada ou sem acesso" description="Mostrando as suas unidades." />
      )}

      {leave && (
        <Banner
          tone="info"
          title={`Você está de ${leave.kind === 'FERIAS' ? 'férias' : 'folga'} hoje`}
          description="Seus checklists não aparecem hoje. Bom descanso!"
          action={<Link href="/minha-area" className="text-xs font-semibold text-brand hover:underline">Gerenciar folgas</Link>}
        />
      )}

      {!leave && groups.length === 0 && (
        <EmptyState icon={Building2} title="Nenhuma unidade vinculada" description="Peça ao Administrador para vincular você a uma unidade." />
      )}

      {onlyOverdue && overdueCount === 0 && groups.length > 0 && (
        <Banner tone="success" title="Nenhuma tarefa atrasada agora" />
      )}

      {groups.map((g) => {
        const tasks = onlyOverdue ? g.tasks.filter(isOverdueTask) : g.tasks;
        if (onlyOverdue && tasks.length === 0) return null;
        const summary = {
          total: g.tasks.length,
          done: g.tasks.filter((t) => t.status === 'DONE').length,
          late: g.tasks.filter((t) => t.status === 'LATE').length,
          missed: g.tasks.filter((t) => t.status === 'MISSED').length,
          todo: g.tasks.filter((t) => t.status === 'PENDING').length,
        };
        return (
          <UnitTasksSection
            key={g.unit.id}
            unitName={groups.length > 1 ? shortUnitName(g.unit.name) : null}
            summary={summary}
            showSummary={!onlyOverdue}
            defaultOpen={onlyOverdue || groups.length === 1}
          >
            {tasks.map((t) => {
              const data: TaskItemData = {
                id: t.id,
                name: t.template.name,
                description: t.template.description,
                limitTime: t.template.limitTime,
                requiresEvidence: t.template.requiresEvidence,
                status: t.status,
                isOverdue: t.status === 'PENDING' && t.dueAt < now,
                moduleHref: MODULE_HREFS[t.template.module] ?? null,
              };
              return <TaskItem key={t.id} task={data} unitParam={searchParams.unit} />;
            })}
            {tasks.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-500">Sem tarefas para hoje.</li>}
          </UnitTasksSection>
        );
      })}
    </div>
  );
}
