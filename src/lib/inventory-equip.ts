import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, canAccessUnit, unitScopeWhere, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { currentOperationalDate } from '@/lib/date/operational';
import type { SessionUser } from '@/lib/auth/session';
import type { InventoryMovementType } from '@prisma/client';

/**
 * Inventário de EQUIPAMENTOS do restaurante (fora do Teknisa).
 * Itens por unidade + movimentações (entrada/saída/ajuste) que atualizam o saldo.
 */
export type EquipResult = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'BLOCKED' | 'NOT_FOUND' };
type Ctx = { ip?: string | null; userAgent?: string | null };

export function canEditEquip(user: SessionUser): boolean {
  return ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN'].includes(user.role);
}

export async function listEquipItems(user: SessionUser, opts: { unitId?: string } = {}) {
  const items = await prisma.inventoryItem.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(opts.unitId ? { unitId: opts.unitId } : {}) },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: { unit: { select: { name: true } }, supplier: { select: { name: true } } },
  });
  return items.map((i) => {
    const qty = Number(i.currentQty); const val = Number(i.unitValue);
    return {
      id: i.id, unitId: i.unitId, unit: i.unit.name, name: i.name, category: i.category,
      supplier: i.supplier?.name ?? null, unitLabel: i.unitLabel, unitValue: val, currentQty: qty,
      minQty: i.minQty != null ? Number(i.minQty) : null, location: i.location, active: i.active,
      totalValue: qty * val, low: i.minQty != null && qty <= Number(i.minQty),
    };
  });
}

export interface EquipSummary { items: number; totalValue: number; lowStock: number }
export async function getEquipSummary(user: SessionUser, opts: { unitId?: string } = {}): Promise<EquipSummary> {
  const items = await listEquipItems(user, opts);
  return {
    items: items.filter((i) => i.active).length,
    totalValue: items.reduce((s, i) => s + i.totalValue, 0),
    lowStock: items.filter((i) => i.active && i.low).length,
  };
}

export async function listEquipMovements(user: SessionUser, opts: { unitId?: string; itemId?: string; limit?: number } = {}) {
  const rows = await prisma.inventoryMovement.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(opts.unitId ? { unitId: opts.unitId } : {}), ...(opts.itemId ? { itemId: opts.itemId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 100,
    include: { item: { select: { name: true, unitLabel: true } }, unit: { select: { name: true } }, createdBy: { select: { name: true } } },
  });
  return rows.map((m) => ({
    id: m.id, item: m.item.name, unitLabel: m.item.unitLabel, unit: m.unit.name, type: m.type,
    qty: Number(m.qty), balanceAfter: Number(m.balanceAfter), note: m.note,
    date: m.operationalDate, by: m.createdBy?.name ?? '',
  }));
}

/* ───────── Itens (CRUD) ───────── */
export async function createEquipItem(user: SessionUser, input: { unitId: string; name: string; supplierId?: string; category?: string; unitLabel?: string; unitValue?: number; minQty?: number; location?: string; initialQty?: number }, ctx: Ctx = {}): Promise<EquipResult> {
  if (!canEditEquip(user)) return { ok: false, reason: 'FORBIDDEN' };
  try { assertUnitAccess(user, input.unitId); } catch (e) { if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' }; throw e; }
  if (!input.name?.trim()) return { ok: false, reason: 'INVALID' };
  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { timezone: true, cutoffHour: true } });
  if (!unit) return { ok: false, reason: 'INVALID' };
  const initial = input.initialQty && input.initialQty > 0 ? input.initialQty : 0;

  const item = await prisma.inventoryItem.create({
    data: {
      unitId: input.unitId, name: input.name.trim(), supplierId: input.supplierId || null,
      category: input.category?.trim() || null, unitLabel: input.unitLabel?.trim() || 'un',
      unitValue: input.unitValue ?? 0, currentQty: initial, minQty: input.minQty ?? null,
      location: input.location?.trim() || null, createdById: user.id,
    },
  });
  if (initial > 0) {
    await prisma.inventoryMovement.create({
      data: { itemId: item.id, unitId: input.unitId, type: 'IN', qty: initial, balanceAfter: initial, unitValue: input.unitValue ?? null, note: 'Saldo inicial', operationalDate: currentOperationalDate(unit), createdById: user.id },
    });
  }
  await audit({ userId: user.id, unitId: input.unitId, action: 'INV_ITEM_CREATE', module: 'INVENTORY', entity: 'inventory_item', entityId: item.id, ...ctx });
  return { ok: true, id: item.id };
}

export async function updateEquipItem(user: SessionUser, id: string, input: { name?: string; supplierId?: string | null; category?: string; unitLabel?: string; unitValue?: number; minQty?: number | null; location?: string }, ctx: Ctx = {}): Promise<EquipResult> {
  if (!canEditEquip(user)) return { ok: false, reason: 'FORBIDDEN' };
  const it = await prisma.inventoryItem.findUnique({ where: { id }, select: { unitId: true } });
  if (!it) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, it.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (input.name !== undefined && !input.name.trim()) return { ok: false, reason: 'INVALID' };
  await prisma.inventoryItem.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId || null } : {}),
      ...(input.category !== undefined ? { category: input.category.trim() || null } : {}),
      ...(input.unitLabel !== undefined ? { unitLabel: input.unitLabel.trim() || 'un' } : {}),
      ...(input.unitValue !== undefined ? { unitValue: input.unitValue } : {}),
      ...(input.minQty !== undefined ? { minQty: input.minQty } : {}),
      ...(input.location !== undefined ? { location: input.location.trim() || null } : {}),
    },
  });
  await audit({ userId: user.id, unitId: it.unitId, action: 'INV_ITEM_UPDATE', module: 'INVENTORY', entity: 'inventory_item', entityId: id, ...ctx });
  return { ok: true };
}

export async function toggleEquipItem(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<EquipResult> {
  if (!canEditEquip(user)) return { ok: false, reason: 'FORBIDDEN' };
  const it = await prisma.inventoryItem.findUnique({ where: { id }, select: { unitId: true } });
  if (!it) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, it.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.inventoryItem.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, unitId: it.unitId, action: active ? 'INV_ITEM_ACTIVATE' : 'INV_ITEM_DEACTIVATE', module: 'INVENTORY', entity: 'inventory_item', entityId: id, ...ctx });
  return { ok: true };
}

export async function deleteEquipItem(user: SessionUser, id: string, ctx: Ctx = {}): Promise<EquipResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const it = await prisma.inventoryItem.findUnique({ where: { id }, select: { unitId: true } });
  if (!it) return { ok: false, reason: 'NOT_FOUND' };
  const moves = await prisma.inventoryMovement.count({ where: { itemId: id } });
  if (moves > 0) return { ok: false, reason: 'BLOCKED' };
  await prisma.inventoryItem.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, unitId: it.unitId, action: 'INV_ITEM_DELETE', module: 'INVENTORY', entity: 'inventory_item', entityId: id, ...ctx });
  return { ok: true };
}

/* ───────── Movimentações (entrada/saída/ajuste) ───────── */
export async function recordEquipMovement(user: SessionUser, input: { itemId: string; type: InventoryMovementType; qty: number; unitValue?: number; note?: string; operationalDate?: string }, ctx: Ctx = {}): Promise<EquipResult & { balanceAfter?: number }> {
  if (!canEditEquip(user)) return { ok: false, reason: 'FORBIDDEN' };
  const item = await prisma.inventoryItem.findUnique({ where: { id: input.itemId }, include: { unit: { select: { timezone: true, cutoffHour: true } } } });
  if (!item) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, item.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const amount = Number(input.qty);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, reason: 'INVALID' };

  const current = Number(item.currentQty);
  let signed: number; // efeito no saldo
  let balanceAfter: number;
  if (input.type === 'IN') { signed = amount; balanceAfter = current + amount; }
  else if (input.type === 'OUT') { signed = -amount; balanceAfter = current - amount; }
  else { balanceAfter = amount; signed = amount - current; } // ADJUST: amount = contado

  const opDate = input.operationalDate && /^\d{4}-\d{2}-\d{2}$/.test(input.operationalDate) ? input.operationalDate : currentOperationalDate(item.unit);

  await prisma.$transaction([
    prisma.inventoryMovement.create({
      data: { itemId: item.id, unitId: item.unitId, type: input.type, qty: signed, balanceAfter, unitValue: input.unitValue ?? null, note: input.note?.trim() || null, operationalDate: opDate, createdById: user.id },
    }),
    prisma.inventoryItem.update({
      where: { id: item.id },
      data: { currentQty: balanceAfter, ...(input.type === 'IN' && input.unitValue != null ? { unitValue: input.unitValue } : {}) },
    }),
  ]);
  await audit({ userId: user.id, unitId: item.unitId, action: `INV_MOVE_${input.type}`, module: 'INVENTORY', entity: 'inventory_item', entityId: item.id, metadata: { qty: signed, balanceAfter }, ...ctx });
  return { ok: true, balanceAfter };
}
