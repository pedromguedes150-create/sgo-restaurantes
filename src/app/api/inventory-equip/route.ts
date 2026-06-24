import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import * as inv from '@/lib/inventory-equip';
import type { InventoryMovementType } from '@prisma/client';

/** Inventário de equipamentos: itens (CRUD) e movimentações. body: { entity, action, ... }. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.entity || !b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r: inv.EquipResult | undefined;
  const e = b.entity as string, a = b.action as string;
  if (e === 'item' && a === 'create') r = await inv.createEquipItem(user, b, ctx);
  else if (e === 'item' && a === 'update') r = await inv.updateEquipItem(user, b.id, b, ctx);
  else if (e === 'item' && a === 'toggle') r = await inv.toggleEquipItem(user, b.id, b.active, ctx);
  else if (e === 'item' && a === 'delete') r = await inv.deleteEquipItem(user, b.id, ctx);
  else if (e === 'movement' && a === 'create') r = await inv.recordEquipMovement(user, { itemId: b.itemId, type: b.type as InventoryMovementType, qty: Number(b.qty), unitValue: b.unitValue != null ? Number(b.unitValue) : undefined, note: b.note }, ctx);

  if (!r) return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, BLOCKED: 409, NOT_FOUND: 404 };
    const msg = r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'BLOCKED' ? 'Item com movimentações: inative em vez de excluir.' : r.reason === 'NOT_FOUND' ? 'Item não encontrado' : 'Dados inválidos';
    return NextResponse.json({ error: msg, reason: r.reason }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
