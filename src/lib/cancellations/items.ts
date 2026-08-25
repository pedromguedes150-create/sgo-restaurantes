import { prisma } from '@/lib/db/prisma';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

export type ItemCancelResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'PHOTO_REQUIRED' };

export interface ItemCancelInput {
  unitId: string;
  productName: string;
  quantity: number;
  /** Valor TOTAL cancelado, como aparece no PDV. */
  value: number;
  /** O produto já tinha saído da cozinha/bar? */
  delivered: boolean;
  canceledAt?: string;
  tableLabel?: string;
  waiterName?: string;
  reasonId?: string;
  note?: string;
  /** Caminho da foto já salva. Obrigatória quando `delivered`. */
  photoPath?: string;
}

/**
 * Motivos padrão de cancelamento de item.
 *
 * "Cliente mudou de ideia" NÃO está na lista de propósito: para isso existe a
 * TROCA no Teknisa, que mantém a venda. Oferecer esse motivo aqui ensinaria a
 * cancelar onde bastava trocar — e é justamente o cancelamento evitável que
 * este módulo existe para enxergar.
 */
export const MOTIVOS_PADRAO_ITEM = [
  'Erro de lançamento do garçom',
  'Produto em falta',
  'Demora no preparo',
  'Produto veio errado',
  'Produto com problema (qualidade)',
  'Cliente foi embora',
];

/** Cria os motivos padrão na primeira vez. Idempotente. */
export async function ensureDefaultItemReasons(): Promise<void> {
  const existe = await prisma.itemCancellationReason.count();
  if (existe > 0) return;
  await prisma.itemCancellationReason.createMany({
    data: MOTIVOS_PADRAO_ITEM.map((name, i) => ({ name, order: i })),
  });
}

export async function getItemReasons() {
  await ensureDefaultItemReasons();
  return prisma.itemCancellationReason.findMany({ where: { active: true }, orderBy: { order: 'asc' } });
}

/**
 * Registro do cancelamento de item, feito pelo gerente que autoriza.
 *
 * O PDV já exige a senha dele para cancelar item — ele está presente em todo
 * cancelamento por definição. Registrar aqui é anotar o que ele já faz, no
 * momento em que já está parado digitando a senha.
 */
export async function registerItemCancellation(
  user: SessionUser,
  input: ItemCancelInput,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ItemCancelResult> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };

  const produto = (input.productName ?? '').trim();
  if (!produto) return { ok: false, reason: 'INVALID' };

  const qtd = Number(input.quantity);
  if (!Number.isFinite(qtd) || qtd <= 0) return { ok: false, reason: 'INVALID' };

  const valor = Number(input.value);
  if (!Number.isFinite(valor) || valor < 0) return { ok: false, reason: 'INVALID' };

  /* A FOTO SÓ É COBRADA QUANDO O PRODUTO SAIU.
     Exigir foto de uma desistência que nunca virou produto seria burocracia sem
     prova nenhuma — e burocracia inútil é o que faz o gerente parar de
     registrar. Quando o produto saiu, a foto dele de volta é a prova. */
  if (input.delivered && !input.photoPath) return { ok: false, reason: 'PHOTO_REQUIRED' };

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { timezone: true, cutoffHour: true } });
  if (!unit) return { ok: false, reason: 'INVALID' };

  const quando = input.canceledAt ? new Date(input.canceledAt) : new Date();
  if (Number.isNaN(quando.getTime())) return { ok: false, reason: 'INVALID' };
  if (quando.getTime() > Date.now() + 60_000) return { ok: false, reason: 'INVALID' };
  const operationalDate = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour }, quando);

  const reason = input.reasonId
    ? await prisma.itemCancellationReason.findUnique({ where: { id: input.reasonId }, select: { id: true, name: true } })
    : null;
  if (input.reasonId && !reason) return { ok: false, reason: 'INVALID' };

  const criado = await prisma.itemCancellation.create({
    data: {
      unitId: input.unitId,
      operationalDate,
      canceledAt: quando,
      tableLabel: input.tableLabel?.trim() || null,
      productName: produto,
      quantity: qtd,
      value: valor,
      waiterName: input.waiterName?.trim() || null,
      reasonId: reason?.id ?? null,
      delivered: Boolean(input.delivered),
      photoPath: input.photoPath || null,
      note: input.note?.trim() || null,
      authorizedById: user.id,
    },
    select: { id: true },
  });

  await audit({
    userId: user.id, unitId: input.unitId, action: 'ITEM_CANCEL_REGISTER', module: 'CANCELLATIONS',
    entity: 'item_cancellation', entityId: criado.id,
    metadata: { produto, qtd, valor, entregue: Boolean(input.delivered), motivo: reason?.name ?? null }, ...ctx,
  });

  return { ok: true, id: criado.id };
}

export async function listItemCancellations(
  user: SessionUser,
  filters: { unitId?: string; yearMonth?: string } = {},
) {
  return prisma.itemCancellation.findMany({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
      ...(filters.yearMonth ? { operationalDate: { startsWith: filters.yearMonth } } : {}),
    },
    orderBy: { canceledAt: 'desc' },
    take: 300,
    include: {
      unit: { select: { name: true } },
      reason: { select: { name: true } },
      authorizedBy: { select: { name: true } },
    },
  });
}

export interface ItemCancelSummary {
  total: number;
  value: number;
  /** Os que já tinham saído da cozinha — perda de verdade. */
  deliveredCount: number;
  deliveredValue: number;
  byWaiter: { name: string; count: number; value: number }[];
  byReason: { name: string; count: number }[];
}

/**
 * Números do mês.
 *
 * O destaque é o **valor cancelado com produto já entregue**: cancelar antes de
 * o produto sair custa zero, e somar os dois num total só esconderia a parte
 * que dói.
 */
export async function getItemCancelSummary(
  user: SessionUser,
  yearMonth: string,
  unitId?: string,
): Promise<ItemCancelSummary> {
  const rows = await prisma.itemCancellation.findMany({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      ...(unitId ? { unitId } : {}),
      operationalDate: { startsWith: yearMonth },
    },
    include: { reason: { select: { name: true } } },
  });

  const porGarcom = new Map<string, { count: number; value: number }>();
  const porMotivo = new Map<string, number>();
  let value = 0;
  let deliveredCount = 0;
  let deliveredValue = 0;

  for (const r of rows) {
    const v = Number(r.value);
    value += v;
    if (r.delivered) { deliveredCount++; deliveredValue += v; }

    const g = r.waiterName?.trim() || 'não informado';
    const atual = porGarcom.get(g) ?? { count: 0, value: 0 };
    porGarcom.set(g, { count: atual.count + 1, value: atual.value + v });

    const m = r.reason?.name ?? 'sem motivo';
    porMotivo.set(m, (porMotivo.get(m) ?? 0) + 1);
  }

  return {
    total: rows.length,
    value: Math.round(value * 100) / 100,
    deliveredCount,
    deliveredValue: Math.round(deliveredValue * 100) / 100,
    /* Piores primeiro: quem olha o painel quer saber de quem cobrar. */
    byWaiter: [...porGarcom.entries()]
      .map(([name, v]) => ({ name, count: v.count, value: Math.round(v.value * 100) / 100 }))
      .sort((a, b) => b.value - a.value || b.count - a.count),
    byReason: [...porMotivo.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  };
}
