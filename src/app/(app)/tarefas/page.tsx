import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { parseUnitParam } from '@/lib/scope/unit-param';
import { getTasksTodayForUser } from '@/lib/tasks/query';
import { leaveOnDate } from '@/lib/manager-area';
import { TaskItem, type TaskItemData } from '@/components/tasks/task-item';
import { UnitTasksSection } from '@/components/tasks/unit-tasks-section';
import { AutoRefresh } from '@/components/layout/auto-refresh';

export const dynamic = 'force-dynamic';

// Módulos já implementados: a tarefa abre o módulo em vez de concluir inline.
const MODULE_HREFS: Partial<Record<string, string>> = {
  WASTE: '/modulos/desperdicios',
  OCCURRENCES: '/modulos/ocorrencias/nova',
  COMMANDS: '/modulos/comandas',
  CANCELLATIONS: '/modulos/cancelamentos',
};

export default async function TarefasPage({ searchParams }: { searchParams: { filter?: string; unit?: string } }) {
  const user = (await getSessionUser())!;
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
  const unitFilter = parseUnitParam(searchParams.unit, units.map((u) => u.id));
  const requestedUnits = (searchParams.unit ?? '').split(',').map((s) => s.trim()).filter(Boolean);
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
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-brand">{onlyOverdue ? 'Tarefas atrasadas' : 'Tarefas de hoje'}</h1>
          {onlyOverdue
            ? <Link href={withUnit('/tarefas')} className="text-sm font-semibold text-accent underline">Ver todas</Link>
            : <span className="flex gap-3"><Link href={withUnit('/tarefas/correcoes')} className="text-sm font-semibold text-accent underline">Correções do dia</Link><Link href={withUnit('/tarefas/historico')} className="text-sm font-semibold text-accent underline">Histórico</Link></span>}
        </div>
        {filteredNames.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Unidade: <span className="font-semibold text-brand">{filteredNames.join(', ')}</span>
            {units.length > 1 && (
              <>
                {' · '}
                <Link href={onlyOverdue ? '/tarefas?filter=atrasadas' : '/tarefas'} className="font-semibold text-accent underline">
                  Ver todas as unidades
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      {unitDenied && (
        <p className="rounded-lg bg-medium/10 px-3 py-2 text-sm font-medium text-[#92600A]">
          Unidade não encontrada ou sem acesso — mostrando as suas unidades.
        </p>
      )}

      {leave && (
        <p className="rounded-lg bg-accent/10 px-3 py-3 text-sm font-medium text-accent">
          🌴 Você está de {leave.kind === 'FERIAS' ? 'férias' : 'folga'} hoje — seus checklists não aparecem. Bom descanso! <Link href="/minha-area" className="underline">Gerenciar folgas</Link>
        </p>
      )}

      {!leave && groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma unidade vinculada.</p>
      )}

      {onlyOverdue && overdueCount === 0 && groups.length > 0 && (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">Nenhuma tarefa atrasada agora 🎉</p>
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
            unitName={groups.length > 1 ? g.unit.name : null}
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
              return <TaskItem key={t.id} task={data} />;
            })}
            {tasks.length === 0 && <p className="text-sm text-muted-foreground">Sem tarefas para hoje.</p>}
          </UnitTasksSection>
        );
      })}
    </div>
  );
}
