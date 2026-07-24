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
  const { notifyUpcomingDueNotes } = await import('@/lib/notes/due');
  const { snapshotYesterdayAllUnits } = await import('@/lib/workforce');
  const { notifyDueManagerTasks } = await import('@/lib/manager-area');
  const { runDueMaintenancePlans } = await import('@/lib/maintenance');
  const { runDueVisitPlans } = await import('@/lib/supervisor/visit-plans');
  const { runWeeklyAdherenceDigest } = await import('@/lib/supervisor/digest');
  const { notifyManagersWithoutRecentFolga } = await import('@/lib/manager-schedule');

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
  async function checkNoteDueDates() {
    try { const r = await notifyUpcomingDueNotes(); if (r.notes + r.gas > 0) console.log(`[notas] ${r.notes + r.gas} boleto(s) a vencer avisados em ${r.units} unidade(s)`); }
    catch (e) { console.error('[notas] falha no aviso de vencimentos:', e); }
  }
  async function snapshotYesterday() {
    try { const r = await snapshotYesterdayAllUnits(); if (r.rows) console.log(`[mapa] snapshot de ontem: ${r.units} unidade(s), ${r.rows} registro(s)`); }
    catch (e) { console.error('[mapa] falha no snapshot diário:', e); }
  }
  async function checkMaintenance() {
    try { const r = await runDueMaintenancePlans(); if (r.notified) console.log(`[manutencao] ${r.notified} plano(s) preventivo(s) vencido(s) avisado(s)`); }
    catch (e) { console.error('[manutencao] falha no aviso preventivo:', e); }
  }
  async function checkSupervision() {
    try { const r = await runDueVisitPlans(); if (r.notified) console.log(`[supervisao] ${r.notified} visita(s) vencida(s) avisada(s)`); }
    catch (e) { console.error('[supervisao] falha no aviso de visita:', e); }
    try { const d = await runWeeklyAdherenceDigest(); if (d.ran) console.log(`[supervisao] resumo semanal de aderência: ${d.flagged} unidade(s) com alerta`); }
    catch (e) { console.error('[supervisao] falha no resumo semanal:', e); }
    try { const f = await notifyManagersWithoutRecentFolga(); if (f.notified) console.log(`[gerentes] ${f.notified} gerente(s) sem folga há 7+ dias — supervisor avisado`); }
    catch (e) { console.error('[gerentes] falha no alerta de folga:', e); }
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
    void checkMaintenance();
    void checkSupervision();
    void checkNoteDueDates();
  }, 15_000);

  // tarefas: a cada 30 min · RH e treinamentos: de hora em hora · vencimento: a cada 10 min
  setInterval(() => { void ensureTaskMaintenance(true); }, 30 * 60 * 1000);
  setInterval(() => { void maybeSyncRh(); }, 60 * 60 * 1000);
  setInterval(() => { void maintainTraining(); }, 60 * 60 * 1000);
  setInterval(() => { void checkDueSoon(); }, 10 * 60 * 1000);
  setInterval(() => { void checkCommunications(); }, 60 * 60 * 1000);
  setInterval(() => { void snapshotYesterday(); }, 60 * 60 * 1000);
  setInterval(() => { void checkMaintenance(); }, 60 * 60 * 1000);
  setInterval(() => { void checkSupervision(); }, 60 * 60 * 1000);
  setInterval(() => { void checkNoteDueDates(); }, 60 * 60 * 1000);
}
