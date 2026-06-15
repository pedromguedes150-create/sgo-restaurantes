/**
 * Scheduler interno do servidor (Next.js instrumentation hook).
 * - Manutenção diária das tarefas (backfill + "não realizada"), no boot e a cada 30 min.
 * - Sincronização automática do RH ~1x/dia (controlada por log de auditoria,
 *   robusta a reinícios: só roda se não houve RH_SYNC_AUTO nas últimas 23h).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { ensureTaskMaintenance } = await import('@/lib/tasks/maintenance');
  const { runDailyRhSync, recentlyAutoSynced } = await import('@/lib/rh/sync');

  async function maybeSyncRh() {
    try {
      if (await recentlyAutoSynced(23)) return;
      const r = await runDailyRhSync();
      if (r.ran) console.log(`[rh-sync] automático: ${r.units} unidade(s), +${r.created} novos, ${r.updated} atualizados`);
    } catch (e) {
      console.error('[rh-sync] falha no sync automático:', e);
    }
  }

  // primeira execução logo após o boot (sem bloquear o startup)
  setTimeout(() => {
    void ensureTaskMaintenance(true);
    void maybeSyncRh();
  }, 15_000);

  // tarefas: a cada 30 min · RH: verificação de hora em hora (roda ~1x/dia)
  setInterval(() => { void ensureTaskMaintenance(true); }, 30 * 60 * 1000);
  setInterval(() => { void maybeSyncRh(); }, 60 * 60 * 1000);
}
