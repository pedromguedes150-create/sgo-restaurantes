import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { getTasksTodayForUser } from '@/lib/tasks/query';
import { TaskItem, type TaskItemData } from '@/components/tasks/task-item';
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
  const groups = await getTasksTodayForUser(user, now);
  const onlyOverdue = searchParams.filter === 'atrasadas';
  const isOverdueTask = (t: (typeof groups)[number]['tasks'][number]) => t.status === 'PENDING' && t.dueAt < now;
  const overdueCount = groups.reduce((s, g) => s + g.tasks.filter(isOverdueTask).length, 0);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-brand">{onlyOverdue ? 'Tarefas atrasadas' : 'Tarefas de hoje'}</h1>
        {onlyOverdue && <Link href="/tarefas" className="text-sm font-semibold text-accent underline">Ver todas</Link>}
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma unidade vinculada.</p>
      )}

      {onlyOverdue && overdueCount === 0 && groups.length > 0 && (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">Nenhuma tarefa atrasada agora 🎉</p>
      )}

      {groups.map((g) => {
        const tasks = onlyOverdue ? g.tasks.filter(isOverdueTask) : g.tasks;
        if (onlyOverdue && tasks.length === 0) return null;
        return (
        <section key={g.unit.id} className="space-y-3">
          {/* Mostra o nome da unidade quando o usuário vê mais de uma */}
          {groups.length > 1 && (
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {g.unit.name}
            </h2>
          )}

          {/* Barra "X de Y concluídas hoje" (oculta no filtro de atrasadas) */}
          {!onlyOverdue && (
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-brand">
                  {g.summary.done} de {g.summary.total} concluídas
                </span>
                <span className="text-muted-foreground">{g.summary.progressPct}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${g.summary.progressPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="space-y-3">
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
            {tasks.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem tarefas para hoje.</p>
            )}
          </div>
        </section>
        );
      })}
    </div>
  );
}
