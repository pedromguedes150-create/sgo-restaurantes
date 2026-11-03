import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { cobertura, diaEmBrasilia, diasDecorridos, diasDistintosNoMes } from './pontuacao';
import { faixaDaValidade, inicioDaFaixa } from '@/lib/stock/validade';
import { carregarConfigDaMeta, gravarConfigDaMeta, type ResultadoDaGravacao } from './vigencia';
import { CHAVE_ESCALA_GERENTES, CHAVE_FORA_DO_PRAZO, DESCONTO_ESCALA_GERENTES_PADRAO, chaveDoPeso, chaveDoStatus, type StatusDoComponente } from './vigencia-regras';

/**
 * Central de configuração da META (16/07, modelo aprovado pelo Pedro):
 * - Módulos DIÁRIOS pontuam por COBERTURA mensal (dias preenchidos ÷ dias do
 *   mês decorridos) — obrigatoriedade diária: não preencheu, o % cai.
 * - Módulos de LANÇAMENTO pontuam invertido — perdem % por correções/edições
 *   da supervisão (penalidade "fora do prazo", já ativa).
 * Pesos novos nascem em 0 (desligados) para não mexer nas notas atuais.
 *
 * v1.174.0 (pedido do Pedro): os CHECKLISTS passaram a ter UM peso (nasce em
 * 100 — é o que a nota sempre foi, só que agora cada checklist vale igual), e
 * entraram cinco coberturas que estão na mão do gerente: contagem do cofre,
 * Realizado da Escala, cancelamentos justificados, tratativas de validade e
 * inventários confirmados. Ocorrências, Manutenção, Pizzas, Despesas, Pedidos
 * e Higiene seguem SEM indicador de propósito: não dependem do gerente.
 *
 * v1.180.0: peso, status e desconto são lidos POR MÊS (`carregarConfigDaMeta`)
 * e gravados com vigência, motivo e histórico (`gravarConfigDaMeta`) — ver
 * `vigencia.ts`. Os getters abaixo continuam existindo para as telas; sem o
 * mês, valem para o mês corrente.
 */
/** Peso dos checklists quando nunca foi gravado: 100, a base da nota de sempre. */
export const TASKS_META_WEIGHT_DEFAULT = 100;
/* v1.170.0 — "Escala de gerentes": cada gerente sem folga cadastrada no mês
   desconta X% da nota. Padrão 5 (pedido do Pedro, 15/10/2026); 0 desliga. */
export const MANAGER_LEAVE_PENALTY_DEFAULT = DESCONTO_ESCALA_GERENTES_PADRAO;

export interface OpcoesDaGravacao { reason: string; validFrom?: string | null }
const semMotivo: OpcoesDaGravacao = { reason: '' };

async function readWeight(componente: string, yearMonth?: string): Promise<number> {
  return (await carregarConfigDaMeta(yearMonth)).peso(componente);
}
function writeWeight(user: SessionUser, componente: string, weight: number, action: string, o: OpcoesDaGravacao): Promise<ResultadoDaGravacao> {
  return gravarConfigDaMeta(user, { key: chaveDoPeso(componente), value: weight, validFrom: o.validFrom, reason: o.reason, action });
}

export const getWasteMetaWeight = (ym?: string) => readWeight('WASTE', ym);
export const getCommandsMetaWeight = (ym?: string) => readWeight('COMMANDS', ym);
export const getTasksMetaWeight = (ym?: string) => readWeight('TASKS', ym);
export const getCashMetaWeight = (ym?: string) => readWeight('CASH', ym);
export const getScheduleMetaWeight = (ym?: string) => readWeight('SCHEDULE', ym);
export const getCancellationsMetaWeight = (ym?: string) => readWeight('CANCELLATIONS', ym);
export const getStockMetaWeight = (ym?: string) => readWeight('STOCK', ym);
export const getInventoryMetaWeight = (ym?: string) => readWeight('INVENTORY', ym);
export const getUtensilsMetaWeight = (ym?: string) => readWeight('UTENSILS', ym);
export const setWasteMetaWeight = (u: SessionUser, w: number, o: OpcoesDaGravacao = semMotivo) => writeWeight(u, 'WASTE', w, 'WASTE_META_WEIGHT_SET', o);
export const setCommandsMetaWeight = (u: SessionUser, w: number, o: OpcoesDaGravacao = semMotivo) => writeWeight(u, 'COMMANDS', w, 'COMMANDS_META_WEIGHT_SET', o);
export const setTasksMetaWeight = (u: SessionUser, w: number, o: OpcoesDaGravacao = semMotivo) => writeWeight(u, 'TASKS', w, 'TASKS_META_WEIGHT_SET', o);
export const setCashMetaWeight = (u: SessionUser, w: number, o: OpcoesDaGravacao = semMotivo) => writeWeight(u, 'CASH', w, 'CASH_META_WEIGHT_SET', o);
export const setScheduleMetaWeight = (u: SessionUser, w: number, o: OpcoesDaGravacao = semMotivo) => writeWeight(u, 'SCHEDULE', w, 'SCHEDULE_META_WEIGHT_SET', o);
export const setCancellationsMetaWeight = (u: SessionUser, w: number, o: OpcoesDaGravacao = semMotivo) => writeWeight(u, 'CANCELLATIONS', w, 'CANCELLATIONS_META_WEIGHT_SET', o);
export const setStockMetaWeight = (u: SessionUser, w: number, o: OpcoesDaGravacao = semMotivo) => writeWeight(u, 'STOCK', w, 'STOCK_META_WEIGHT_SET', o);
export const setInventoryMetaWeight = (u: SessionUser, w: number, o: OpcoesDaGravacao = semMotivo) => writeWeight(u, 'INVENTORY', w, 'INVENTORY_META_WEIGHT_SET', o);
export const setUtensilsMetaWeight = (u: SessionUser, w: number, o: OpcoesDaGravacao = semMotivo) => writeWeight(u, 'UTENSILS', w, 'UTENSILS_META_WEIGHT_SET', o);

/** v1.180.0 — o STATUS do componente (só ATIVO entra na nota), por mês. */
export async function getComponentStatus(componente: string, ym?: string): Promise<StatusDoComponente> {
  return (await carregarConfigDaMeta(ym)).status(componente);
}
export function setComponentStatus(user: SessionUser, componente: string, status: string, o: OpcoesDaGravacao = semMotivo) {
  return gravarConfigDaMeta(user, { key: chaveDoStatus(componente), value: status, validFrom: o.validFrom, reason: o.reason, action: 'META_STATUS_SET' });
}

/** % descontado da nota por gerente/coordenador SEM folga nem férias no mês. */
export async function getManagerLeaveMetaPenalty(ym?: string): Promise<number> {
  return (await carregarConfigDaMeta(ym)).descontoEscalaGerentes;
}
export function setManagerLeaveMetaPenalty(user: SessionUser, pct: number, o: OpcoesDaGravacao = semMotivo) {
  return gravarConfigDaMeta(user, { key: CHAVE_ESCALA_GERENTES, value: pct, validFrom: o.validFrom, reason: o.reason, action: 'MANAGER_LEAVE_META_PENALTY_SET' });
}
/** % descontado por lançamento com data corrigida pela supervisão (v1.180.0: lido por mês). */
export async function getLateEntryPenaltyPctDoMes(ym?: string): Promise<number> {
  return (await carregarConfigDaMeta(ym)).descontoForaDoPrazo;
}
export function setLateEntryPenaltyPctComVigencia(user: SessionUser, pct: number, o: OpcoesDaGravacao = semMotivo) {
  return gravarConfigDaMeta(user, { key: CHAVE_FORA_DO_PRAZO, value: pct, validFrom: o.validFrom, reason: o.reason, action: 'LATE_ENTRY_PENALTY_SET' });
}

export type Cobertura = { done: number; missed: number };

/** Dias decorridos do mês no dia de Brasília (até ontem no mês corrente; zero num mês futuro). */
function decorridos(yearMonth: string): number {
  return diasDecorridos(yearMonth, diaEmBrasilia(new Date()));
}
/** Limites do mês como instantes: [00:00 do dia 1º, 00:00 do dia 1º seguinte) em Brasília (UTC−3). */
function janelaDoMes(yearMonth: string): { de: Date; ate: Date } {
  const [y, m] = yearMonth.split('-').map(Number);
  const prox = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { de: new Date(`${yearMonth}-01T03:00:00Z`), ate: new Date(`${prox}-01T03:00:00Z`) };
}

/**
 * Checklists do dia (v1.174.0): realizados ÷ (realizados + não realizados) de
 * TODOS os checklists que entram na meta, cada instância valendo igual. O peso
 * por checklist (`TaskTemplate.weight`) fica no banco e não é mais lido aqui.
 */
export async function getChecklistsCoverage(unitId: string, yearMonth: string): Promise<Cobertura> {
  const porStatus = await prisma.taskInstance.groupBy({
    by: ['status'],
    where: { unitId, operationalDate: { startsWith: yearMonth }, status: { in: ['DONE', 'MISSED'] }, template: { entersMeta: true } },
    _count: true,
  });
  const n = (s: string) => porStatus.find((p) => p.status === s)?._count ?? 0;
  return { done: n('DONE'), missed: n('MISSED') };
}

/** Cobertura diária do mês: done = dias com lançamento, missed = dias sem. */
export async function getWasteCoverage(unitId: string, yearMonth: string): Promise<Cobertura> {
  const done = await prisma.wasteEntry.count({ where: { unitId, operationalDate: { startsWith: yearMonth } } });
  return cobertura(done, decorridos(yearMonth));
}
export async function getCommandsCoverage(unitId: string, yearMonth: string): Promise<Cobertura> {
  const done = await prisma.commandCount.count({ where: { unitId, operationalDate: { startsWith: yearMonth } } });
  return cobertura(done, decorridos(yearMonth));
}

/**
 * Gestão de Troco: dias com CONTAGEM do cofre (movimento `COUNT`) ÷ dias
 * decorridos. O movimento tem hora, não dia operacional: o dia é o de Brasília.
 */
export async function getCashCoverage(unitId: string, yearMonth: string): Promise<Cobertura> {
  const dec = decorridos(yearMonth);
  if (dec === 0) return { done: 0, missed: 0 };
  const { de, ate } = janelaDoMes(yearMonth);
  const movs = await prisma.cashVaultMovement.findMany({ where: { unitId, type: 'COUNT', createdAt: { gte: de, lt: ate } }, select: { createdAt: true } });
  return cobertura(diasDistintosNoMes(movs.map((m) => diaEmBrasilia(m.createdAt)), yearMonth, dec), dec);
}

/**
 * Escala: dias decorridos com o REALIZADO preenchido na unidade (qualquer
 * célula gravada em `schedule_actuals` naquele dia) ÷ dias decorridos. Unidade
 * sem colaborador ativo não tem grade a preencher → fora da conta.
 */
export async function getScheduleCoverage(unitId: string, yearMonth: string): Promise<Cobertura> {
  const dec = decorridos(yearMonth);
  if (dec === 0) return { done: 0, missed: 0 };
  const pessoas = await prisma.collaboratorUnit.count({ where: { unitId, collaborator: { active: true } } });
  if (pessoas === 0) return { done: 0, missed: 0 };
  const [y, m] = yearMonth.split('-').map(Number);
  const dias = await prisma.scheduleActual.findMany({
    where: { unitId, date: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } },
    distinct: ['date'], select: { date: true },
  });
  return cobertura(diasDistintosNoMes(dias.map((d) => d.date.toISOString().slice(0, 10)), yearMonth, dec), dec);
}

/**
 * Cancelamentos: cupons cancelados COM justificativa ÷ cancelados do mês. O dia
 * de hoje ainda está aberto e não cobra; mês sem cancelamento fica fora.
 */
export async function getCancellationsCoverage(unitId: string, yearMonth: string): Promise<Cobertura> {
  const hoje = diaEmBrasilia(new Date());
  const porStatus = await prisma.cancellation.groupBy({
    by: ['status'],
    where: { unitId, operationalDate: { startsWith: yearMonth, lt: hoje } },
    _count: true,
  });
  const n = (s: string) => porStatus.find((p) => p.status === s)?._count ?? 0;
  return { done: n('JUSTIFIED'), missed: n('PENDING') };
}

/**
 * Estoque: tratativas de validade RESPONDIDAS no mês (Auditoria
 * `STOCK_LOT_REVIEW`) ÷ (respondidas + PENDENTES). Pendente = lote em uso cuja
 * faixa de hoje ainda não foi respondida e que entrou nessa faixa ATÉ ONTEM
 * (o dia da entrada é do gerente); ele conta contra o MÊS em que entrou na
 * faixa atual — responder depois tira a pendência daquele mês e soma no mês da
 * resposta. Mês sem pergunta nenhuma fica fora.
 */
export async function getStockCoverage(unitId: string, yearMonth: string): Promise<Cobertura> {
  const hoje = diaEmBrasilia(new Date());
  const { de, ate } = janelaDoMes(yearMonth);
  const [respondidas, lotes] = await Promise.all([
    prisma.auditLog.count({ where: { unitId, action: 'STOCK_LOT_REVIEW', createdAt: { gte: de, lt: ate } } }),
    prisma.stockLot.findMany({
      where: { unitId, status: 'OPEN', expiresAt: { not: null } },
      select: { expiresAt: true, lastReviewBand: true, product: { select: { alertDays: true } } },
    }),
  ]);
  let pendentes = 0;
  for (const l of lotes) {
    const faixa = faixaDaValidade(l.expiresAt, hoje, l.product.alertDays);
    if (!faixa || l.lastReviewBand === faixa.chave) continue;
    const inicio = inicioDaFaixa(l.expiresAt as string, faixa.chave, l.product.alertDays);
    if (inicio < hoje && inicio.startsWith(yearMonth + '-')) pendentes++;
  }
  return { done: respondidas, missed: pendentes };
}

/**
 * Inventário (Teknisa): agendamentos do mês CONFIRMADOS pelo gerente ÷
 * agendados cuja data já passou (pendente com data futura ainda não cobra).
 * Mês sem agendamento fica fora.
 */
export async function getInventoryCoverage(unitId: string, yearMonth: string): Promise<Cobertura> {
  const hoje = diaEmBrasilia(new Date());
  const ags = await prisma.inventorySchedule.findMany({ where: { unitId, scheduledDate: { startsWith: yearMonth } }, select: { status: true, scheduledDate: true } });
  let done = 0; let missed = 0;
  for (const a of ags) {
    if (a.status === 'DONE') done++;
    else if (a.status === 'MISSED' || a.scheduledDate < hoje) missed++;
  }
  return { done, missed };
}
