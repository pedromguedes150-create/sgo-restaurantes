import type { ComponenteDaMeta, DescontoDaMeta } from './pontuacao';

/**
 * OS COMPONENTES DA META (v1.174.0) — uma lista só, lida pela nota e pelo
 * detalhamento. Cada componente lê o seu módulo (a MESMA função que a tela do
 * módulo usa) e o peso configurado em Metas → Configuração da Meta.
 *
 * Imports dinâmicos de propósito: `training`, `communications/meta` e
 * `evaluation` importam a nota (`tasks/summary`) por outros caminhos, e um
 * import estático aqui fecharia o ciclo.
 */

export const NOME_CHECKLISTS = 'Checklists do dia';

export async function componentesDaMeta(unitId: string, yearMonth: string): Promise<ComponenteDaMeta[]> {
  const [{ getTrainingMonthStats, getTrainingWeight }, { getCommunicationMonthStats, getCommunicationWeight }, { getEvaluationMonthStats, getEvaluationWeight }, cfg] = await Promise.all([
    import('@/lib/training'), import('@/lib/communications/meta'), import('@/lib/people/evaluation'), import('./config'),
  ]);
  const { getUtensilsCoverage } = await import('@/lib/utensilios/inventario');
  const [
    tasks, tasksW, t, tW, c, cW, e, eW, w, wW, cm, cmW,
    cash, cashW, sch, schW, canc, cancW, st, stW, inv, invW, ut, utW,
  ] = await Promise.all([
    cfg.getChecklistsCoverage(unitId, yearMonth), cfg.getTasksMetaWeight(),
    getTrainingMonthStats(unitId, yearMonth), getTrainingWeight(),
    getCommunicationMonthStats(unitId, yearMonth), getCommunicationWeight(),
    getEvaluationMonthStats(unitId, yearMonth), getEvaluationWeight(),
    cfg.getWasteCoverage(unitId, yearMonth), cfg.getWasteMetaWeight(),
    cfg.getCommandsCoverage(unitId, yearMonth), cfg.getCommandsMetaWeight(),
    cfg.getCashCoverage(unitId, yearMonth), cfg.getCashMetaWeight(),
    cfg.getScheduleCoverage(unitId, yearMonth), cfg.getScheduleMetaWeight(),
    cfg.getCancellationsCoverage(unitId, yearMonth), cfg.getCancellationsMetaWeight(),
    cfg.getStockCoverage(unitId, yearMonth), cfg.getStockMetaWeight(),
    cfg.getInventoryCoverage(unitId, yearMonth), cfg.getInventoryMetaWeight(),
    getUtensilsCoverage(unitId, yearMonth), cfg.getUtensilsMetaWeight(),
  ]);
  return [
    { key: 'TASKS', name: NOME_CHECKLISTS, weight: tasksW, done: tasks.done, missed: tasks.missed },
    { key: 'TRAINING', name: 'Treinamentos (POPs)', weight: tW, done: t.done, missed: t.missed },
    { key: 'COMMUNICATION', name: 'Comunicados', weight: cW, done: c.done, missed: c.missed },
    { key: 'PEOPLE_EVALUATION', name: 'Avaliações da equipe', weight: eW, done: e.done, missed: e.missed },
    { key: 'WASTE', name: 'Desperdício diário (cobertura)', weight: wW, done: w.done, missed: w.missed },
    { key: 'COMMANDS', name: 'Comandas diárias (cobertura)', weight: cmW, done: cm.done, missed: cm.missed },
    { key: 'CASH', name: 'Gestão de Troco (contagem do cofre)', weight: cashW, done: cash.done, missed: cash.missed },
    { key: 'SCHEDULE', name: 'Escala (Realizado preenchido)', weight: schW, done: sch.done, missed: sch.missed },
    { key: 'CANCELLATIONS', name: 'Cancelamentos justificados', weight: cancW, done: canc.done, missed: canc.missed },
    { key: 'STOCK', name: 'Estoque (tratativas de validade)', weight: stW, done: st.done, missed: st.missed },
    { key: 'INVENTORY', name: 'Inventário Teknisa (agendamentos confirmados)', weight: invW, done: inv.done, missed: inv.missed },
    { key: 'UTENSILS', name: 'Inventário de utensílios (enviado no mês)', weight: utW, done: ut.done, missed: ut.missed },
  ];
}

export interface DescontosDaMeta {
  lista: DescontoDaMeta[];
  lateEntry: { count: number; pct: number };
  managerLeave: { gerentes: number; semFolga: number; nomesSemFolga: string[]; pct: number };
}

/** Os descontos diretos na nota, com os dados que o detalhamento mostra. */
export async function descontosDaMeta(unitId: string, yearMonth: string): Promise<DescontosDaMeta> {
  const [{ countLateEntries, getLateEntryPenaltyPct }, { getManagerLeaveMetaStats }, { getManagerLeaveMetaPenalty }] = await Promise.all([
    import('@/lib/late-entry'), import('./escala-gerentes'), import('./config'),
  ]);
  const [lateCount, penaltyPct, mlStats, mlPct] = await Promise.all([
    countLateEntries(unitId, yearMonth), getLateEntryPenaltyPct(), getManagerLeaveMetaStats(unitId, yearMonth), getManagerLeaveMetaPenalty(),
  ]);
  return {
    lista: [
      { name: 'Fora do prazo', quantidade: lateCount, pct: penaltyPct },
      { name: 'Escala de gerentes', quantidade: mlStats.semFolga, pct: mlPct },
    ],
    lateEntry: { count: lateCount, pct: penaltyPct },
    managerLeave: { gerentes: mlStats.gerentes, semFolga: mlStats.semFolga, nomesSemFolga: mlStats.nomesSemFolga, pct: mlPct },
  };
}
