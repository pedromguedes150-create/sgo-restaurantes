import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
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

export default async function TarefasPage({ searchParams }: { searchParams: { filter?: string } }) {
  const user = (await getSessionUser())!;
  const now = new Date();
  // Folga/férias do gerente: nesses dias os checklists não aparecem para ele.
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const leave = await leaveOnDate(user.id, todayISO);
  const groups = leave ? [] : await getTasksTodayForUser(user, now);
  const onlyOverdue = searchParams.filter === 'atrasadas';
  const isOverdueTask = (t: (typeof groups)[number]['tasks'][number]) => t.status === 'PENDING' && t.dueAt < now;
  const overdueCount = groups.reduce((s, g) => s + g.tasks.filter(isOverdueTask).length, 0);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-brand">{onlyOverdue ? 'Tarefas atrasadas' : 'Tarefas de hoje'}</h1>
        {onlyOverdue
          ? <Link href="/tarefas" className="text-sm font-semibold text-accent underline">Ver todas</Link>
          : <span className="flex gap-3"><Link href="/tarefas/correcoes" className="text-sm font-semibold text-accent underline">Correções do dia</Link><Link href="/tarefas/historico" className="text-sm font-semibold text-accent underline">Histórico</Link></span>}
      </div>

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
