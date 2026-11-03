import type { ComponenteDaMeta, DescontoDaMeta } from './pontuacao';
import { carregarConfigDaMeta } from './vigencia';

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
  const [{ getTrainingMonthStats }, { getCommunicationMonthStats }, { getEvaluationMonthStats }, cfg, { getUtensilsCoverage }] = await Promise.all([
    import('@/lib/training'), import('@/lib/communications/meta'), import('@/lib/people/evaluation'), import('./config'), import('@/lib/utensilios/inventario'),
  ]);
  /* v1.180.0 — peso e status VIGENTES NO MÊS pedido, numa leitura só (mês fechado = os valores que valiam nele). */
  const [vig, tasks, t, c, e, w, cm, cash, sch, canc, st, inv, ut] = await Promise.all([
    carregarConfigDaMeta(yearMonth),
    cfg.getChecklistsCoverage(unitId, yearMonth),
    getTrainingMonthStats(unitId, yearMonth),
    getCommunicationMonthStats(unitId, yearMonth),
    getEvaluationMonthStats(unitId, yearMonth),
    cfg.getWasteCoverage(unitId, yearMonth),
    cfg.getCommandsCoverage(unitId, yearMonth),
    cfg.getCashCoverage(unitId, yearMonth),
    cfg.getScheduleCoverage(unitId, yearMonth),
    cfg.getCancellationsCoverage(unitId, yearMonth),
    cfg.getStockCoverage(unitId, yearMonth),
    cfg.getInventoryCoverage(unitId, yearMonth),
    getUtensilsCoverage(unitId, yearMonth),
  ]);
  const comp = (key: string, name: string, cob: { done: number; missed: number }): ComponenteDaMeta => ({ key, name, weight: vig.peso(key), status: vig.status(key), done: cob.done, missed: cob.missed });
  return [
    comp('TASKS', NOME_CHECKLISTS, tasks),
    comp('TRAINING', 'Treinamentos (POPs)', t),
    comp('COMMUNICATION', 'Comunicados', c),
    comp('PEOPLE_EVALUATION', 'Avaliações da equipe', e),
    comp('WASTE', 'Desperdício diário (cobertura)', w),
    comp('COMMANDS', 'Comandas diárias (cobertura)', cm),
    comp('CASH', 'Gestão de Troco (contagem do cofre)', cash),
    comp('SCHEDULE', 'Escala (Realizado preenchido)', sch),
    comp('CANCELLATIONS', 'Cancelamentos justificados', canc),
    comp('STOCK', 'Estoque (tratativas de validade)', st),
    comp('INVENTORY', 'Inventário Teknisa (agendamentos confirmados)', inv),
    comp('UTENSILS', 'Inventário de utensílios (enviado no mês)', ut),
  ];
}

export interface DescontosDaMeta {
  lista: DescontoDaMeta[];
  lateEntry: { count: number; pct: number };
  managerLeave: { gerentes: number; semFolga: number; nomesSemFolga: string[]; pct: number };
}

/** Os descontos diretos na nota, com os dados que o detalhamento mostra. */
export async function descontosDaMeta(unitId: string, yearMonth: string): Promise<DescontosDaMeta> {
  const [{ countLateEntries }, { getManagerLeaveMetaStats }] = await Promise.all([import('@/lib/late-entry'), import('./escala-gerentes')]);
  /* v1.180.0 — os % de desconto vigentes NO MÊS (uma leitura só). */
  const [vig, lateCount, mlStats] = await Promise.all([carregarConfigDaMeta(yearMonth), countLateEntries(unitId, yearMonth), getManagerLeaveMetaStats(unitId, yearMonth)]);
  const penaltyPct = vig.descontoForaDoPrazo;
  const mlPct = vig.descontoEscalaGerentes;
  return {
    lista: [
      { name: 'Fora do prazo', quantidade: lateCount, pct: penaltyPct, detalhe: lateCount > 0 ? `${lateCount} lançamento(s) com data corrigida ou lançado(s) pela supervisão` : undefined },
      { name: 'Escala de gerentes', quantidade: mlStats.semFolga, pct: mlPct, detalhe: mlStats.nomesSemFolga.length ? `sem folga cadastrada: ${mlStats.nomesSemFolga.join(', ')}` : undefined },
    ],
    lateEntry: { count: lateCount, pct: penaltyPct },
    managerLeave: { gerentes: mlStats.gerentes, semFolga: mlStats.semFolga, nomesSemFolga: mlStats.nomesSemFolga, pct: mlPct },
  };
}
