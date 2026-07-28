import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { canEditModule } from '@/lib/permissions';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';

/**
 * Denominações do cofre de troco — configuráveis por unidade (Módulo 18).
 *
 * Fonte da verdade: tabela `CashDenomination`. Enquanto a unidade não tiver
 * nenhuma linha cadastrada, o sistema usa DEFAULT_DENOMINATIONS — que é
 * byte a byte a lista fixa de hoje. Assim, no dia do deploy, nada muda.
 *
 * A configuração decide o que aparece nos formulários (blocos SAIU/ENTROU),
 * o que é aceito na entrada e o que conta no indicador de "notas grandes".
 * Ela NÃO reescreve histórico: cada saldo/movimento é gravado como JSON com
 * as próprias chaves (fotografia do que foi contado).
 */

export type DenomKind = 'NOTE' | 'COIN' | 'OTHER';

export interface Denomination {
  /** Chave usada no JSON de saldos/movimentos: "200", "0.50", "outros". */
  key: string;
  /** Valor em R$; nulo só na linha "outros". */
  value: number | null;
  kind: DenomKind;
  label: string | null;
  /** Bloco de miúdos/troco (SAIU na reposição, RECEBIDO do escritório). */
  isSmall: boolean;
  /** Bloco de notas grandes (ENTROU na reposição, ENVIADO ao escritório). */
  isBig: boolean;
  /** Conta no indicador "notas grandes ≥ 50% do cofre" (R1: lista própria). */
  countsAsBigIndicator: boolean;
  order: number;
}

type Ctx = { ip?: string | null; userAgent?: string | null };

/**
 * Padrão de fábrica — reproduz EXATAMENTE a lista fixa de hoje:
 *  - big (ENTROU/enviado):        200, 100, 50, 20   (era `only="big"`)
 *  - small (SAIU/recebido):       10, 5, 2, 1, 0,50, 0,25, 0,10, 0,05  (era `only="small"`)
 *  - indicador ≥50% do cofre:     200, 100, 50       (era `BIG_NOTES`, sem o R$ 20)
 *  - "outros":                    linha de sistema (PIX/caixinha), sem valor.
 */
export const DEFAULT_DENOMINATIONS: Denomination[] = [
  { key: '200',    value: 200,  kind: 'NOTE', label: null, isSmall: false, isBig: true,  countsAsBigIndicator: true,  order: 0 },
  { key: '100',    value: 100,  kind: 'NOTE', label: null, isSmall: false, isBig: true,  countsAsBigIndicator: true,  order: 1 },
  { key: '50',     value: 50,   kind: 'NOTE', label: null, isSmall: false, isBig: true,  countsAsBigIndicator: true,  order: 2 },
  { key: '20',     value: 20,   kind: 'NOTE', label: null, isSmall: false, isBig: true,  countsAsBigIndicator: false, order: 3 },
  { key: '10',     value: 10,   kind: 'NOTE', label: null, isSmall: true,  isBig: false, countsAsBigIndicator: false, order: 4 },
  { key: '5',      value: 5,    kind: 'NOTE', label: null, isSmall: true,  isBig: false, countsAsBigIndicator: false, order: 5 },
  { key: '2',      value: 2,    kind: 'NOTE', label: null, isSmall: true,  isBig: false, countsAsBigIndicator: false, order: 6 },
  { key: '1',      value: 1,    kind: 'COIN', label: null, isSmall: true,  isBig: false, countsAsBigIndicator: false, order: 7 },
  { key: '0.50',   value: 0.5,  kind: 'COIN', label: null, isSmall: true,  isBig: false, countsAsBigIndicator: false, order: 8 },
  { key: '0.25',   value: 0.25, kind: 'COIN', label: null, isSmall: true,  isBig: false, countsAsBigIndicator: false, order: 9 },
  { key: '0.10',   value: 0.1,  kind: 'COIN', label: null, isSmall: true,  isBig: false, countsAsBigIndicator: false, order: 10 },
  { key: '0.05',   value: 0.05, kind: 'COIN', label: null, isSmall: true,  isBig: false, countsAsBigIndicator: false, order: 11 },
  { key: 'outros', value: null, kind: 'OTHER', label: 'Outros (PIX/caixinha)', isSmall: false, isBig: false, countsAsBigIndicator: false, order: 12 },
];

/** Config resolvida de uma unidade — o que as telas e a validação consomem. */
export interface DenomConfig {
  /** Denominações ativas, na ordem de exibição. */
  denominations: Denomination[];
  /** Todas as chaves ativas. */
  keys: string[];
  /** Chaves com valor (fora "outros") — para validação de múltiplos. */
  numericKeys: string[];
  /** Chaves do bloco de miúdos/troco. */
  smallKeys: string[];
  /** Chaves do bloco de notas grandes. */
  bigKeys: string[];
  /** Chaves que contam no indicador "≥50% do cofre". */
  indicatorKeys: string[];
  /** Valor por chave (null em "outros"). */
  valueByKey: Record<string, number | null>;
}

function toConfig(list: Denomination[]): DenomConfig {
  const denominations = [...list].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  const valueByKey: Record<string, number | null> = {};
  for (const d of denominations) valueByKey[d.key] = d.value;
  return {
    denominations,
    keys: denominations.map((d) => d.key),
    numericKeys: denominations.filter((d) => d.value != null).map((d) => d.key),
    smallKeys: denominations.filter((d) => d.isSmall).map((d) => d.key),
    bigKeys: denominations.filter((d) => d.isBig).map((d) => d.key),
    indicatorKeys: denominations.filter((d) => d.countsAsBigIndicator).map((d) => d.key),
    valueByKey,
  };
}

function rowToDenom(r: {
  key: string; value: Prisma.Decimal | null; kind: string; label: string | null;
  isSmall: boolean; isBig: boolean; countsAsBigIndicator: boolean; order: number;
}): Denomination {
  return {
    key: r.key,
    value: r.value != null ? Number(r.value) : null,
    kind: (r.kind as DenomKind) ?? 'NOTE',
    label: r.label,
    isSmall: r.isSmall,
    isBig: r.isBig,
    countsAsBigIndicator: r.countsAsBigIndicator,
    order: r.order,
  };
}

/** Config padrão (padrão de fábrica) — sem tocar no banco. */
export function defaultConfig(): DenomConfig {
  return toConfig(DEFAULT_DENOMINATIONS);
}

/**
 * Denominações efetivas de uma unidade. Se houver linhas ATIVAS no banco, usa
 * elas; caso contrário, devolve o padrão de fábrica (compatibilidade total).
 */
export async function getDenominations(unitId: string): Promise<DenomConfig> {
  const rows = await prisma.cashDenomination.findMany({
    where: { unitId, active: true },
    orderBy: [{ order: 'asc' }, { key: 'asc' }],
  });
  if (rows.length === 0) return defaultConfig();
  return toConfig(rows.map(rowToDenom));
}

/**
 * Cria as denominações padrão da unidade na primeira vez (padrão do
 * ensureDefaultModels): idempotente e auditado. Chamada pela tela de
 * configuração (PR 2) — no PR 1 fica pronta, mas ainda sem chamador.
 */
export async function ensureUnitDenominations(unitId: string, user: SessionUser, ctx: Ctx = {}): Promise<void> {
  const count = await prisma.cashDenomination.count({ where: { unitId } });
  if (count > 0) return;
  await prisma.cashDenomination.createMany({
    data: DEFAULT_DENOMINATIONS.map((d) => ({
      unitId,
      key: d.key,
      value: d.value,
      kind: d.kind,
      label: d.label,
      isSmall: d.isSmall,
      isBig: d.isBig,
      countsAsBigIndicator: d.countsAsBigIndicator,
      order: d.order,
    })),
  });
  await audit({
    userId: user.id, unitId, action: 'CASH_DENOM_SEED', module: 'CASH',
    entity: 'cash_denomination', metadata: { count: DEFAULT_DENOMINATIONS.length }, ...ctx,
  });
}

/* ───────── Configuração (Módulo 18, PR 2) — só quem tem CASH_CONFIG ───────── */

const CASH_CONFIG = 'CASH_CONFIG';

/**
 * Catálogo FECHADO das denominações reais do Real (R3: sem valor livre). É a
 * lista que a tela oferece para ligar/desligar e classificar. Inclui o R$ 0,01
 * (fora do padrão de fábrica: só entra na unidade se a supervisão optar).
 */
export const REAL_DENOMINATIONS: Denomination[] = [
  ...DEFAULT_DENOMINATIONS.filter((d) => d.key !== 'outros'),
  { key: '0.01', value: 0.01, kind: 'COIN', label: null, isSmall: true, isBig: false, countsAsBigIndicator: false, order: 12 },
  { ...DEFAULT_DENOMINATIONS.find((d) => d.key === 'outros')!, order: 13 },
];

/** Rótulo automático da denominação ("Nota R$ 10,00" / "Moeda R$ 0,50" / "Outros"). */
export function denomLabel(d: { key: string; value: number | null; kind: DenomKind; label: string | null }): string {
  if (d.label) return d.label;
  if (d.kind === 'OTHER' || d.value == null) return 'Outros (PIX/caixinha)';
  const brl = d.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  return `${d.kind === 'COIN' ? 'Moeda' : 'Nota'} R$ ${brl}`;
}

type Ctx2 = { ip?: string | null; userAgent?: string | null };
type Fail = { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND'; detail?: string };
export type ConfigResult = { ok: true } | Fail;

/** Checagem dupla obrigatória (CLAUDE.md regra 3): permissão de função E escopo de unidade. */
async function guard(user: SessionUser, unitId: string): Promise<Fail | null> {
  if (!(await canEditModule(user.role, CASH_CONFIG))) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  return null;
}

function heldBalance(balances: unknown, key: string): number {
  const v = Number((balances as Record<string, unknown> | null | undefined)?.[key]);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

export interface DenomAdminRow {
  key: string; value: number | null; kind: DenomKind; label: string | null;
  isSmall: boolean; isBig: boolean; countsAsBigIndicator: boolean; order: number;
  active: boolean;
  /** Saldo atual no cofre para esta chave (base do bloqueio R2). */
  balance: number;
  /** "outros" — linha de sistema (R6). */
  system: boolean;
}
export interface DenomAdminData {
  denominations: DenomAdminRow[];
  available: { key: string; label: string }[]; // catálogo ainda não presente na unidade
}

/** Dados da tela de configuração de uma unidade (semeia na 1ª abertura). Null = sem permissão. */
export async function listUnitDenominations(user: SessionUser, unitId: string): Promise<DenomAdminData | null> {
  if (!(await canEditModule(user.role, CASH_CONFIG))) return null;
  if (!canAccessUnit(user, unitId)) return null;
  await ensureUnitDenominations(unitId, user);
  const [rows, vault] = await Promise.all([
    prisma.cashDenomination.findMany({ where: { unitId }, orderBy: [{ order: 'asc' }, { key: 'asc' }] }),
    prisma.cashVault.findUnique({ where: { unitId }, select: { balances: true } }),
  ]);
  const present = new Set(rows.map((r) => r.key));
  const denominations: DenomAdminRow[] = rows.map((r) => ({
    key: r.key,
    value: r.value != null ? Number(r.value) : null,
    kind: (r.kind as DenomKind) ?? 'NOTE',
    label: r.label,
    isSmall: r.isSmall, isBig: r.isBig, countsAsBigIndicator: r.countsAsBigIndicator,
    order: r.order, active: r.active,
    balance: heldBalance(vault?.balances, r.key),
    system: r.key === 'outros',
  }));
  const available = REAL_DENOMINATIONS.filter((d) => !present.has(d.key)).map((d) => ({ key: d.key, label: denomLabel(d) }));
  return { denominations, available };
}

/**
 * Liga/desliga e classifica uma denominação (upsert por chave do catálogo).
 * R2: não desativa com saldo ≠ 0. R6: "outros" não desativa nem recebe blocos.
 */
export async function saveDenomination(
  user: SessionUser, unitId: string,
  input: { key: string; active?: boolean; isSmall?: boolean; isBig?: boolean; countsAsBigIndicator?: boolean },
  ctx: Ctx2 = {},
): Promise<ConfigResult> {
  const g = await guard(user, unitId); if (g) return g;
  const catalog = REAL_DENOMINATIONS.find((d) => d.key === input.key);
  if (!catalog) return { ok: false, reason: 'INVALID', detail: 'Denominação fora do catálogo do Real.' };
  const isOutros = input.key === 'outros';
  if (isOutros && input.active === false) {
    return { ok: false, reason: 'INVALID', detail: 'A linha "Outros" é de sistema e não pode ser desativada.' };
  }
  if (input.active === false) {
    const vault = await prisma.cashVault.findUnique({ where: { unitId }, select: { balances: true } });
    const b = Math.abs(heldBalance(vault?.balances, input.key));
    if (b > 0.005) {
      return { ok: false, reason: 'INVALID', detail: `Não é possível desativar ${denomLabel(catalog)}: ainda há R$ ${b.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no cofre. Zere na próxima conferência e tente de novo.` };
    }
  }
  const existing = await prisma.cashDenomination.findUnique({ where: { unitId_key: { unitId, key: input.key } } });
  const data = {
    active: input.active ?? existing?.active ?? true,
    isSmall: isOutros ? false : (input.isSmall ?? existing?.isSmall ?? catalog.isSmall),
    isBig: isOutros ? false : (input.isBig ?? existing?.isBig ?? catalog.isBig),
    countsAsBigIndicator: isOutros ? false : (input.countsAsBigIndicator ?? existing?.countsAsBigIndicator ?? catalog.countsAsBigIndicator),
  };
  if (existing) {
    await prisma.cashDenomination.update({ where: { id: existing.id }, data });
  } else {
    const agg = await prisma.cashDenomination.aggregate({ where: { unitId }, _max: { order: true } });
    await prisma.cashDenomination.create({
      data: { unitId, key: catalog.key, value: catalog.value, kind: catalog.kind, label: catalog.label, order: (agg._max.order ?? -1) + 1, ...data },
    });
  }
  await audit({
    userId: user.id, unitId, action: data.active ? 'CASH_DENOM_SET' : 'CASH_DENOM_OFF',
    module: 'CASH', entity: 'cash_denomination', metadata: { key: input.key, ...data }, ...ctx,
  });
  return { ok: true };
}

/** Reordena as denominações da unidade pela ordem das chaves recebidas. */
export async function reorderDenominations(user: SessionUser, unitId: string, orderedKeys: string[], ctx: Ctx2 = {}): Promise<ConfigResult> {
  const g = await guard(user, unitId); if (g) return g;
  await prisma.$transaction(
    orderedKeys.map((key, i) => prisma.cashDenomination.updateMany({ where: { unitId, key }, data: { order: i } })),
  );
  await audit({ userId: user.id, unitId, action: 'CASH_DENOM_REORDER', module: 'CASH', entity: 'cash_denomination', metadata: { orderedKeys }, ...ctx });
  return { ok: true };
}

export interface CopyResult { copied: number; skipped: { unitName: string; key: string }[] }

/**
 * Copia a configuração desta unidade para TODAS as outras unidades do escopo do
 * usuário (R4). No destino, respeita o R2: não desativa denominação com saldo ≠ 0
 * (mantém ativa e reporta em `skipped`).
 */
export async function copyDenominationsToMyUnits(
  user: SessionUser, unitId: string, ctx: Ctx2 = {},
): Promise<{ ok: true; result: CopyResult } | Fail> {
  const g = await guard(user, unitId); if (g) return g;
  const source = await prisma.cashDenomination.findMany({ where: { unitId }, orderBy: { order: 'asc' } });
  if (source.length === 0) return { ok: false, reason: 'INVALID', detail: 'Configure a unidade de origem antes de copiar.' };
  const targets = await prisma.unit.findMany({
    where: { active: true, id: { not: unitId }, ...unitScopeWhere(user, 'id') },
    select: { id: true, name: true },
  });
  const skipped: { unitName: string; key: string }[] = [];
  let copied = 0;
  for (const t of targets) {
    const vault = await prisma.cashVault.findUnique({ where: { unitId: t.id }, select: { balances: true } });
    for (const s of source) {
      const existing = await prisma.cashDenomination.findUnique({ where: { unitId_key: { unitId: t.id, key: s.key } } });
      const held = Math.abs(heldBalance(vault?.balances, s.key)) > 0.005;
      // R2 no destino: não desativa uma chave que ainda tem saldo
      const active = (!s.active && existing?.active && held) ? true : s.active;
      if (active !== s.active) skipped.push({ unitName: t.name, key: s.key });
      const payload = {
        value: s.value, kind: s.kind, label: s.label,
        isSmall: s.isSmall, isBig: s.isBig, countsAsBigIndicator: s.countsAsBigIndicator, order: s.order, active,
      };
      if (existing) await prisma.cashDenomination.update({ where: { id: existing.id }, data: payload });
      else await prisma.cashDenomination.create({ data: { unitId: t.id, key: s.key, ...payload } });
    }
    copied++;
    await audit({ userId: user.id, unitId: t.id, action: 'CASH_DENOM_COPY', module: 'CASH', entity: 'cash_denomination', metadata: { from: unitId }, ...ctx });
  }
  return { ok: true, result: { copied, skipped } };
}
