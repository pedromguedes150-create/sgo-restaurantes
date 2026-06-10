import { getSessionUser } from '@/lib/auth/session';
import { getTasksTodayForUser } from '@/lib/tasks/query';
import { TaskItem, type TaskItemData } from '@/components/tasks/task-item';
import { AutoRefresh } from '@/components/layout/auto-refresh';

export const dynamic = 'force-dynamic';

// Módulos já implementados: a tarefa abre o módulo em vez de concluir inline.
const MODULE_HREFS: Partial<Record<string, string>> = {
  WASTE: '/modulos/desperdicios',
};

export default async function TarefasPage() {
  const user = (await getSessionUser())!;
  const now = new Date();
  const groups = await getTasksTodayForUser(user, now);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />
      <h1 className="text-xl font-bold text-brand">Tarefas de hoje</h1>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma unidade vinculada.</p>
      )}

      {groups.map((g) => (
        <section key={g.unit.id} className="space-y-3">
          {/* Mostra o nome da unidade quando o usuário vê mais de uma */}
          {groups.length > 1 && (
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {g.unit.name}
            </h2>
          )}

          {/* Barra "X de Y concluídas hoje" */}
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

          <div className="space-y-3">
            {g.tasks.map((t) => {
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
            {g.tasks.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem tarefas para hoje.</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
