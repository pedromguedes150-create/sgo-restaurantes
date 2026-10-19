import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { cobertura, diaEmBrasilia, diasDecorridos, diasDistintosNoMes } from './pontuacao';
import { faixaDaValidade, inicioDaFaixa } from '@/lib/stock/validade';

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
 */
const WASTE_KEY = 'WASTE_META_WEIGHT';
const COMMANDS_KEY = 'COMMANDS_META_WEIGHT';
const TASKS_KEY = 'TASKS_META_WEIGHT';
const CASH_KEY = 'CASH_META_WEIGHT';
const SCHEDULE_KEY = 'SCHEDULE_META_WEIGHT';
const CANCELLATIONS_KEY = 'CANCELLATIONS_META_WEIGHT';
const STOCK_KEY = 'STOCK_META_WEIGHT';
const INVENTORY_KEY = 'INVENTORY_META_WEIGHT';
/** Peso dos checklists quando nunca foi gravado: 100, a base da nota de sempre. */
export const TASKS_META_WEIGHT_DEFAULT = 100;
/* v1.170.0 — "Escala de gerentes": cada gerente sem folga cadastrada no mês
   desconta X% da nota. Padrão 5 (pedido do Pedro, 15/10/2026); 0 desliga. */
const MANAGER_LEAVE_PENALTY_KEY = 'MANAGER_LEAVE_META_PENALTY';
export const MANAGER_LEAVE_PENALTY_DEFAULT = 5;

async function readWeight(key: string, def = 0): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key } });
  const n = s ? Number(s.value) : def;
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : def;
}
async function writeWeight(user: SessionUser, key: string, weight: number, action: string) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  const w = Math.max(0, Math.trunc(weight));
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: String(w) }, update: { value: String(w) } });
  await audit({ userId: user.id, action, module: 'CONFIG', metadata: { weight: w } });
  return { ok: true as const };
}

export const getWasteMetaWeight = () => readWeight(WASTE_KEY);
export const getCommandsMetaWeight = () => readWeight(COMMANDS_KEY);
export const getTasksMetaWeight = () => readWeight(TASKS_KEY, TASKS_META_WEIGHT_DEFAULT);
export const getCashMetaWeight = () => readWeight(CASH_KEY);
export const getScheduleMetaWeight = () => readWeight(SCHEDULE_KEY);
export const getCancellationsMetaWeight = () => readWeight(CANCELLATIONS_KEY);
export const getStockMetaWeight = () => readWeight(STOCK_KEY);
export const getInventoryMetaWeight = () => readWeight(INVENTORY_KEY);
export const setWasteMetaWeight = (u: SessionUser, w: number) => writeWeight(u, WASTE_KEY, w, 'WASTE_META_WEIGHT_SET');
export const setCommandsMetaWeight = (u: SessionUser, w: number) => writeWeight(u, COMMANDS_KEY, w, 'COMMANDS_META_WEIGHT_SET');
export const setTasksMetaWeight = (u: SessionUser, w: number) => writeWeight(u, TASKS_KEY, w, 'TASKS_META_WEIGHT_SET');
export const setCashMetaWeight = (u: SessionUser, w: number) => writeWeight(u, CASH_KEY, w, 'CASH_META_WEIGHT_SET');
export const setScheduleMetaWeight = (u: SessionUser, w: number) => writeWeight(u, SCHEDULE_KEY, w, 'SCHEDULE_META_WEIGHT_SET');
export const setCancellationsMetaWeight = (u: SessionUser, w: number) => writeWeight(u, CANCELLATIONS_KEY, w, 'CANCELLATIONS_META_WEIGHT_SET');
export const setStockMetaWeight = (u: SessionUser, w: number) => writeWeight(u, STOCK_KEY, w, 'STOCK_META_WEIGHT_SET');
export const setInventoryMetaWeight = (u: SessionUser, w: number) => writeWeight(u, INVENTORY_KEY, w, 'INVENTORY_META_WEIGHT_SET');

/** % descontado da nota por gerente/coordenador SEM folga nem férias no mês. */
export async function getManagerLeaveMetaPenalty(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: MANAGER_LEAVE_PENALTY_KEY } });
  const n = s ? Number(s.value) : MANAGER_LEAVE_PENALTY_DEFAULT;
  return Number.isFinite(n) && n >= 0 ? Math.min(100, n) : MANAGER_LEAVE_PENALTY_DEFAULT;
}
export async function setManagerLeaveMetaPenalty(user: SessionUser, pct: number) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  const v = Math.max(0, Math.min(100, Number(pct)));
  if (!Number.isFinite(v)) return { ok: false as const, reason: 'INVALID' as const };
  await prisma.appSetting.upsert({ where: { key: MANAGER_LEAVE_PENALTY_KEY }, create: { key: MANAGER_LEAVE_PENALTY_KEY, value: String(v) }, update: { value: String(v) } });
  await audit({ userId: user.id, action: 'MANAGER_LEAVE_META_PENALTY_SET', module: 'CONFIG', metadata: { pct: v } });
  return { ok: true as const };
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
