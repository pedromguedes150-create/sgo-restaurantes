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
        {onlyOverdue
          ? <Link href="/tarefas" className="text-sm font-semibold text-accent underline">Ver todas</Link>
          : <span className="flex gap-3"><Link href="/tarefas/correcoes" className="text-sm font-semibold text-accent underline">Correções do dia</Link><Link href="/tarefas/historico" className="text-sm font-semibold text-accent underline">Histórico</Link></span>}
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

          {/* Acompanhamento do dia: o que falta fazer vs feito (no prazo/atrasado) */}
          {!onlyOverdue && (() => {
            const total = g.tasks.length;
            const done = g.tasks.filter((t) => t.status === 'DONE').length;     // no prazo (conta na meta)
            const late = g.tasks.filter((t) => t.status === 'LATE').length;     // feito fora do prazo
            const missed = g.tasks.filter((t) => t.status === 'MISSED').length; // não realizada
            const todo = g.tasks.filter((t) => t.status === 'PENDING').length;  // ainda a fazer
            const pct = (n: number) => (total ? (n / total) * 100 : 0);
            return (
              <div>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className={`font-semibold ${todo > 0 ? 'text-critical' : 'text-success'}`}>
                    {todo > 0 ? `${todo} a fazer` : 'Tudo realizado ✅'}
                  </span>
                  <span className="text-xs text-muted-foreground">{done + late} de {total} feitos</span>
                </div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-success transition-all" style={{ width: `${pct(done)}%` }} />
                  <div className="h-full bg-medium transition-all" style={{ width: `${pct(late)}%` }} />
                  <div className="h-full bg-critical transition-all" style={{ width: `${pct(missed)}%` }} />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>🟢 {done} no prazo <span className="text-[10px]">(conta na meta)</span></span>
                  {late > 0 && <span>🟡 {late} fora do prazo</span>}
                  {missed > 0 && <span>🔴 {missed} não realizada(s)</span>}
                  {todo > 0 && <span className="font-semibold text-critical">⚪ {todo} a fazer</span>}
                </div>
              </div>
            );
          })()}

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
