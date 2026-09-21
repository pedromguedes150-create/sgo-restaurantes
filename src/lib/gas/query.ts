import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import {
  encadear, mediaPonderada, ordemCronologica, precoImplausivel, precoPorKg, resumoDoPeriodo,
  variacaoEntre, TETO_PRECO_KG_PADRAO, type ResumoDeGas,
} from '@/lib/gas/variacao';

const ALERT_KEY = 'GAS_ALERT_PCT';
const DEFAULT_ALERT = 10;
const TETO_KEY = 'GAS_MAX_PRICE_KG';

export async function getGasAlertPct(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: ALERT_KEY } });
  const n = s ? Number(s.value) : DEFAULT_ALERT;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ALERT;
}
export async function setGasAlertPct(user: SessionUser, pct: number) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  const p = Math.max(1, Math.round(pct));
  await prisma.appSetting.upsert({ where: { key: ALERT_KEY }, create: { key: ALERT_KEY, value: String(p) }, update: { value: String(p) } });
  await audit({ userId: user.id, action: 'GAS_ALERT_PCT_SET', module: 'CONFIG', metadata: { pct: p } });
  return { ok: true as const };
}

/**
 * Teto do preço/kg aceito num lançamento de gás (R$).
 *
 * Não é um limite de orçamento: é o corte entre "caro" e "não é preço de
 * quilo". Existe porque nada barrava uma nota de milhares de reais por kg — o
 * preço do BOTIJÃO inteiro, ou o TOTAL da nota, parando na coluna de preço
 * unitário da planilha de importação.
 */
export async function getGasMaxPriceKg(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: TETO_KEY } });
  const n = s ? Number(s.value) : TETO_PRECO_KG_PADRAO;
  return Number.isFinite(n) && n > 0 ? n : TETO_PRECO_KG_PADRAO;
}
export async function setGasMaxPriceKg(user: SessionUser, teto: number) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  const t = Number(teto);
  if (!Number.isFinite(t) || t <= 0) return { ok: false as const, reason: 'INVALID' as const };
  const v = Math.round(t * 100) / 100;
  await prisma.appSetting.upsert({ where: { key: TETO_KEY }, create: { key: TETO_KEY, value: String(v) }, update: { value: String(v) } });
  await audit({ userId: user.id, action: 'GAS_MAX_PRICE_KG_SET', module: 'CONFIG', metadata: { teto: v } });
  return { ok: true as const };
}

export async function listGasReceipts(user: SessionUser, opts: { unitId?: string; limit?: number } = {}) {
  return prisma.gasReceipt.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(opts.unitId ? { unitId: opts.unitId } : {}) },
    orderBy: [{ operationalDate: 'desc' }, { createdAt: 'desc' }],
    take: opts.limit ?? 100,
    include: { unit: { select: { name: true, code: true } }, supplier: { select: { name: true } }, createdBy: { select: { name: true } } },
  });
}

export interface GasVarRow {
  id: string;
  date: string;
  supplier: string;
  lancadoPor: string | null;
  kg: number;
  total: number;
  price: number;
  prevPrice: number | null;
  variationPct: number | null;
  alerted: boolean;
  /** A data foi corrigida por Admin/Supervisão — a tela marca a linha. */
  dateEdited: boolean;
  dateEditedByName: string | null;
}

export interface GasVarUnit extends ResumoDeGas {
  unitId: string;
  unit: string;
  rows: GasVarRow[];
  /** Preço/kg da última nota ANTES do período — a âncora da primeira variação. */
  ancora: number | null;
}

export interface RelatorioDeGas {
  de: string;
  ate: string;
  unidades: GasVarUnit[];
  /** Consolidado da rede: soma dos kg e do valor, e o preço ponderado. */
  total: ResumoDeGas;
}

/** Primeiro dia do mês, `months - 1` meses atrás. */
function inicioDaJanela(months: number): string {
  const d = new Date();
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (months - 1), 1));
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * RELATÓRIO DO GÁS — por unidade, no período, com a variação recalculada.
 *
 * A variação NÃO vem mais das colunas `prevPricePerKg`/`variationPct`: elas
 * eram um retrato do momento do lançamento e envelheciam com nota retroativa e
 * com correção de data (ver `variacao.ts`). Aqui a série é reencadeada a cada
 * leitura, do mais antigo para o mais novo.
 *
 * A ÂNCORA é o que faz o filtro de período ser honesto: busca-se também a
 * última nota ANTERIOR ao período, só para a primeira linha ter contra o quê
 * comparar. Sem isso, a variação de uma nota mudaria conforme o período que a
 * pessoa escolheu ver — e dois relatórios da mesma nota diriam números
 * diferentes.
 */
export async function getRelatorioDeGas(
  user: SessionUser,
  opts: { de?: string; ate?: string; unitId?: string; months?: number } = {},
): Promise<RelatorioDeGas> {
  const de = opts.de && ISO.test(opts.de) ? opts.de : inicioDaJanela(opts.months ?? 12);
  const ate = opts.ate && ISO.test(opts.ate) ? opts.ate : '9999-12-31';

  const escopo = { ...unitScopeWhere(user, 'unitId'), ...(opts.unitId ? { unitId: opts.unitId } : {}) };
  const campos = {
    id: true, unitId: true, operationalDate: true, createdAt: true,
    quantityKg: true, totalValue: true, alerted: true,
    dateEdited: true, dateEditedByName: true,
    unit: { select: { name: true } },
    supplier: { select: { name: true } },
    createdBy: { select: { name: true } },
  } as const;

  const [doPeriodo, anteriores] = await Promise.all([
    prisma.gasReceipt.findMany({
      where: { ...escopo, operationalDate: { gte: de, lte: ate } },
      orderBy: [{ operationalDate: 'asc' }, { createdAt: 'asc' }],
      select: campos,
    }),
    /* As notas ANTES do período. Traz-se o conjunto e escolhe-se a última de
       cada unidade em memória: `distinct` do Prisma pega a PRIMEIRA linha de
       cada grupo na ordem da consulta, e depender dessa sutileza para uma
       âncora é o tipo de coisa que quebra numa migração de versão. */
    prisma.gasReceipt.findMany({
      where: { ...escopo, operationalDate: { lt: de } },
      orderBy: [{ operationalDate: 'asc' }, { createdAt: 'asc' }],
      select: { unitId: true, quantityKg: true, totalValue: true },
    }),
  ]);

  const ancoraPorUnidade = new Map<string, number>();
  for (const a of anteriores) {
    const p = precoPorKg(Number(a.totalValue), Number(a.quantityKg));
    if (p !== null) ancoraPorUnidade.set(a.unitId, p);
  }

  const porUnidade = new Map<string, typeof doPeriodo>();
  for (const r of doPeriodo) {
    const lista = porUnidade.get(r.unitId) ?? [];
    lista.push(r);
    porUnidade.set(r.unitId, lista);
  }

  const unidades: GasVarUnit[] = [];
  for (const [unitId, notas] of porUnidade) {
    const ancora = ancoraPorUnidade.get(unitId) ?? null;
    const encadeadas = encadear(
      notas.map((r) => ({
        id: r.id,
        operationalDate: r.operationalDate,
        createdAt: r.createdAt,
        quantityKg: Number(r.quantityKg),
        totalValue: Number(r.totalValue),
        bruto: r,
      })),
      ancora,
    );

    unidades.push({
      unitId,
      unit: notas[0].unit.name,
      ancora,
      ...resumoDoPeriodo(encadeadas),
      rows: encadeadas.map((e) => ({
        id: e.nota.id,
        date: e.nota.operationalDate,
        supplier: e.nota.bruto.supplier?.name ?? 'Sem fornecedor',
        lancadoPor: e.nota.bruto.createdBy?.name ?? null,
        kg: e.nota.quantityKg,
        total: e.nota.totalValue,
        price: e.pricePerKg,
        prevPrice: e.prevPrice,
        variationPct: e.variationPct,
        alerted: e.nota.bruto.alerted,
        dateEdited: e.nota.bruto.dateEdited,
        dateEditedByName: e.nota.bruto.dateEditedByName,
      })),
    });
  }
  unidades.sort((a, b) => a.unit.localeCompare(b.unit, 'pt-BR'));

  /* CONSOLIDADO DA REDE. Os kg e o valor somam; o preço médio é o PONDERADO
     (valor total ÷ kg total). Média das médias das unidades daria o mesmo peso
     a quem compra 300 kg e a quem compra 6.000. As pontas (primeiro/último,
     mínimo/máximo) são as da rede no período. */
  const todas = unidades.flatMap((u) => u.rows);
  const kg = todas.reduce((s, r) => s + r.kg, 0);
  const valor = todas.reduce((s, r) => s + r.total, 0);
  const precos = todas.filter((r) => r.price > 0).map((r) => r.price);
  const ordenadasNoTempo = [...todas].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).filter((r) => r.price > 0);
  const primeiro = ordenadasNoTempo[0]?.price ?? null;
  const ultimo = ordenadasNoTempo[ordenadasNoTempo.length - 1]?.price ?? null;

  return {
    de,
    ate,
    unidades,
    total: {
      notas: todas.length,
      kg: Math.round(kg * 100) / 100,
      valor: Math.round(valor * 100) / 100,
      precoMedio: kg > 0 ? Math.round((valor / kg) * 10000) / 10000 : null,
      menorPreco: precos.length ? Math.min(...precos) : null,
      maiorPreco: precos.length ? Math.max(...precos) : null,
      primeiroPreco: primeiro,
      ultimoPreco: ultimo,
      variacaoNoPeriodo: primeiro !== null && ultimo !== null ? variacaoEntre(ultimo, primeiro) : null,
    },
  };
}

/** Compatibilidade: a lista por unidade que a tela e a exportação já usavam. */
export async function getGasVariationReport(user: SessionUser, opts: { unitId?: string; months?: number } = {}): Promise<GasVarUnit[]> {
  return (await getRelatorioDeGas(user, opts)).unidades;
}

/**
 * A variação de CADA nota, recalculada sobre o histórico inteiro da unidade.
 *
 * Existe para as telas que listam recebimentos soltos (a aba de gás dentro de
 * Notas). Elas mostravam `variationPct` gravado — o retrato do lançamento — e
 * era ali que aparecia a nota com data corrigida sem variação nenhuma.
 *
 * A série é a COMPLETA de propósito, sem janela: uma janela mudaria a variação
 * da nota mais antiga da lista conforme o filtro, e a conta seria irreprodutível.
 * O custo é baixo — são poucos milhares de recebimentos, com cinco campos cada.
 */
export async function getVariacoesPorNota(
  user: SessionUser,
  opts: { unitId?: string } = {},
): Promise<Map<string, { prevPrice: number | null; variationPct: number | null }>> {
  const notas = await prisma.gasReceipt.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(opts.unitId ? { unitId: opts.unitId } : {}) },
    orderBy: [{ operationalDate: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, unitId: true, operationalDate: true, createdAt: true, quantityKg: true, totalValue: true },
  });

  const porUnidade = new Map<string, typeof notas>();
  for (const n of notas) {
    const lista = porUnidade.get(n.unitId) ?? [];
    lista.push(n);
    porUnidade.set(n.unitId, lista);
  }

  const saida = new Map<string, { prevPrice: number | null; variationPct: number | null }>();
  for (const lista of porUnidade.values()) {
    for (const e of encadear(lista.map((n) => ({
      id: n.id,
      operationalDate: n.operationalDate,
      createdAt: n.createdAt,
      quantityKg: Number(n.quantityKg),
      totalValue: Number(n.totalValue),
    })))) {
      saida.set(e.nota.id, { prevPrice: e.prevPrice, variationPct: e.variationPct });
    }
  }
  return saida;
}

export interface GasGroupStat { key: string; name: string; count: number; avg: number; last: number; min: number; max: number; kg: number; total: number }
export interface GasMonthPoint { month: string; avg: number; count: number }
/** Nota com preço/kg fora de qualquer faixa real — ver `precoImplausivel`. */
export interface GasOutlier { id: string; unitId: string; unitName: string; date: string; pricePerKg: number; kg: number; total: number }
export interface GasDashboard {
  totalReceipts: number;
  avgPrice: number;
  lastPrice: number | null;
  totalKg: number; // volume comprado no filtro
  totalValue: number; // valor comprado no filtro
  byUnit: GasGroupStat[];
  bySupplier: GasGroupStat[];
  monthly: GasMonthPoint[];
  alertPct: number;
  /** Teto de preço/kg em vigor (R$), para a tela explicar o corte. */
  tetoPrecoKg: number;
  foraDaFaixa: GasOutlier[];
}

type AggRow = { key: string; name: string; price: number; date: string; createdAt: Date; id: string; kg: number; total: number };

/**
 * Agrupa por unidade/fornecedor.
 *
 * Duas coisas aqui já saíram erradas na tela: a média era SIMPLES (agora é
 * ponderada, valor ÷ kg — ver `mediaPonderada`) e o "último" era decidido por
 * `date >=`, ou seja, pela ordem em que o banco devolveu as linhas. Com quatro
 * notas no mesmo 23/07 o último preço mudava entre duas leituras da mesma tela;
 * o desempate agora é o mesmo da cadeia de variação (`ordemCronologica`).
 */
function agg(rows: AggRow[]): GasGroupStat[] {
  const map = new Map<string, { name: string; prices: number[]; ultima: AggRow | null; kg: number; total: number }>();
  for (const r of rows) {
    const cur = map.get(r.key) ?? { name: r.name, prices: [], ultima: null, kg: 0, total: 0 };
    cur.prices.push(r.price);
    cur.kg += r.kg; cur.total += r.total;
    if (!cur.ultima || ordemCronologica(paraNota(r), paraNota(cur.ultima)) > 0) cur.ultima = r;
    map.set(r.key, cur);
  }
  return [...map.entries()].map(([key, v]) => ({
    key, name: v.name, count: v.prices.length,
    avg: precoPorKg(v.total, v.kg) ?? 0,
    last: v.ultima ? v.ultima.price : 0, min: Math.min(...v.prices), max: Math.max(...v.prices),
    kg: Math.round(v.kg * 100) / 100, total: Math.round(v.total * 100) / 100,
  })).sort((a, b) => a.avg - b.avg);
}

/** `AggRow` visto como nota, só para reusar a ordenação da cadeia. */
const paraNota = (r: AggRow) => ({ id: r.id, operationalDate: r.date, createdAt: r.createdAt, quantityKg: r.kg, totalValue: r.total });

/**
 * Painel de gás: comparativo por unidade, por fornecedor e tendência mensal.
 * Respeita os filtros de unidade, fornecedor e MÊS específico (yearMonth). Sem
 * mês, usa a janela dos últimos `months` meses. Também soma o VOLUME (kg) comprado.
 */
export async function getGasDashboard(user: SessionUser, opts: { unitId?: string; supplierId?: string; yearMonth?: string; months?: number } = {}): Promise<GasDashboard> {
  let dateFilter: Record<string, string> = {};
  if (opts.yearMonth && /^\d{4}-\d{2}$/.test(opts.yearMonth)) {
    // mês específico [primeiro dia, primeiro dia do mês seguinte)
    const [y, m] = opts.yearMonth.split('-').map(Number);
    const next = new Date(Date.UTC(y, m, 1));
    const nextStr = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
    dateFilter = { gte: `${opts.yearMonth}-01`, lt: nextStr };
  } else {
    const months = opts.months ?? 6;
    const d = new Date();
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (months - 1), 1));
    dateFilter = { gte: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-01` };
  }

  const receipts = await prisma.gasReceipt.findMany({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      ...(opts.unitId ? { unitId: opts.unitId } : {}),
      ...(opts.supplierId ? { supplierId: opts.supplierId } : {}),
      operationalDate: dateFilter,
    },
    /* `createdAt` é o desempate. Sem ele, duas notas do mesmo dia voltam na
       ordem que o Postgres quiser — e era dessa ordem que saía o "último
       preço/kg" da tela. No arquivo real há QUATRO notas no mesmo 23/07. */
    orderBy: [{ operationalDate: 'asc' }, { createdAt: 'asc' }],
    include: { unit: { select: { name: true } }, supplier: { select: { name: true } } },
  });

  const all = receipts.map((r) => ({ id: r.id, price: Number(r.pricePerKg), date: r.operationalDate, createdAt: r.createdAt, kg: Number(r.quantityKg), total: Number(r.totalValue), unitId: r.unitId, unitName: r.unit.name, supplierId: r.supplierId, supplierName: r.supplier?.name ?? 'Sem fornecedor' }));

  const byUnit = agg(all.map((r) => ({ key: r.unitId, name: r.unitName, id: r.id, price: r.price, date: r.date, createdAt: r.createdAt, kg: r.kg, total: r.total })));
  const bySupplier = agg(all.map((r) => ({ key: r.supplierId ?? 'none', name: r.supplierName, id: r.id, price: r.price, date: r.date, createdAt: r.createdAt, kg: r.kg, total: r.total })));

  // Tendência mensal: preço PONDERADO do mês (valor ÷ kg), não a média dos preços.
  const byMonth = new Map<string, { quantityKg: number; totalValue: number }[]>();
  for (const r of all) { const m = r.date.slice(0, 7); const arr = byMonth.get(m) ?? []; arr.push({ quantityKg: r.kg, totalValue: r.total }); byMonth.set(m, arr); }
  const monthly: GasMonthPoint[] = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, ns]) => ({ month, avg: mediaPonderada(ns) ?? 0, count: ns.length }));

  const avgPrice = mediaPonderada(all.map((r) => ({ quantityKg: r.kg, totalValue: r.total }))) ?? 0;
  /* O último é o último da CADEIA (data e, no mesmo dia, ordem de lançamento).
     Com `date >=` bastavam duas notas do mesmo dia para o número depender da
     ordem em que o banco devolveu as linhas. */
  const last = all.length
    ? [...all].sort((a, b) => ordemCronologica(
        { id: a.id, operationalDate: a.date, createdAt: a.createdAt, quantityKg: a.kg, totalValue: a.total },
        { id: b.id, operationalDate: b.date, createdAt: b.createdAt, quantityKg: b.kg, totalValue: b.total },
      )).at(-1)!
    : null;
  const [alertPct, tetoPrecoKg] = await Promise.all([getGasAlertPct(), getGasMaxPriceKg()]);

  /* Notas fora de qualquer faixa real de preço. Elas não são só um número feio
     num cartão: como TODO gráfico de gás é escalado pelo maior valor da série,
     uma só achata as barras de todas as outras no piso — foi o defeito relatado
     ("as colunas não estão subindo"). Por isso saem nomeadas, com link, em vez
     de apenas distorcerem a tela em silêncio. */
  const foraDaFaixa: GasOutlier[] = all
    .filter((r) => precoImplausivel(r.price, tetoPrecoKg))
    .sort((a, b) => b.price - a.price)
    .slice(0, 20)
    .map((r) => ({ id: r.id, unitId: r.unitId, unitName: r.unitName, date: r.date, pricePerKg: r.price, kg: r.kg, total: r.total }));

  return {
    totalReceipts: all.length, avgPrice, lastPrice: last ? last.price : null,
    totalKg: Math.round(all.reduce((s, r) => s + r.kg, 0) * 100) / 100,
    totalValue: Math.round(all.reduce((s, r) => s + r.total, 0) * 100) / 100,
    byUnit, bySupplier, monthly, alertPct, tetoPrecoKg, foraDaFaixa,
  };
}
