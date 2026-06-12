/**
 * Scheduler interno do servidor (Next.js instrumentation hook).
 * Garante a manutenção diária das tarefas (backfill + "não realizada")
 * mesmo que ninguém abra o sistema — roda no boot e a cada 30 minutos.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { ensureTaskMaintenance } = await import('@/lib/tasks/maintenance');

  // primeira execução logo após o boot (sem bloquear o startup)
  setTimeout(() => {
    void ensureTaskMaintenance(true);
  }, 15_000);

  setInterval(() => {
    void ensureTaskMaintenance(true);
  }, 30 * 60 * 1000);
}
