import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
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
