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
  const { reconcileAllTraining } = await import('@/lib/training');
  const { notifyDueSoonTasks } = await import('@/lib/tasks/notify');
  const { notifyDueSoonCommunications } = await import('@/lib/communications/notify');
  const { snapshotYesterdayAllUnits } = await import('@/lib/workforce');
  const { notifyDueManagerTasks } = await import('@/lib/manager-area');

  async function maintainTraining() {
    try { await reconcileAllTraining(); } catch (e) { console.error('[training] falha na reconciliação:', e); }
  }
  async function checkDueSoon() {
    try { const n = await notifyDueSoonTasks(); if (n) console.log(`[tasks] ${n} aviso(s) de vencimento enviado(s)`); }
    catch (e) { console.error('[tasks] falha no aviso de vencimento:', e); }
    try { const m = await notifyDueManagerTasks(); if (m) console.log(`[minha-area] ${m} lembrete(s) de tarefa pessoal`); }
    catch (e) { console.error('[minha-area] falha nos lembretes:', e); }
  }
  async function checkCommunications() {
    try { const n = await notifyDueSoonCommunications(); if (n) console.log(`[comunicacao] ${n} lembrete(s) enviado(s)`); }
    catch (e) { console.error('[comunicacao] falha no lembrete:', e); }
  }
  async function snapshotYesterday() {
    try { const r = await snapshotYesterdayAllUnits(); if (r.rows) console.log(`[mapa] snapshot de ontem: ${r.units} unidade(s), ${r.rows} registro(s)`); }
    catch (e) { console.error('[mapa] falha no snapshot diário:', e); }
  }

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
    void maintainTraining();
    void checkDueSoon();
    void checkCommunications();
    void snapshotYesterday();
  }, 15_000);

  // tarefas: a cada 30 min · RH e treinamentos: de hora em hora · vencimento: a cada 10 min
  setInterval(() => { void ensureTaskMaintenance(true); }, 30 * 60 * 1000);
  setInterval(() => { void maybeSyncRh(); }, 60 * 60 * 1000);
  setInterval(() => { void maintainTraining(); }, 60 * 60 * 1000);
  setInterval(() => { void checkDueSoon(); }, 10 * 60 * 1000);
  setInterval(() => { void checkCommunications(); }, 60 * 60 * 1000);
  setInterval(() => { void snapshotYesterday(); }, 60 * 60 * 1000);
}
