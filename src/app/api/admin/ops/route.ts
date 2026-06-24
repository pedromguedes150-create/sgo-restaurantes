import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import * as ops from '@/lib/admin-ops';
import type { OpResult } from '@/lib/admin-ops';

/**
 * Dispatch das exclusões de LANÇAMENTOS da Operação (Admin).
 * body: { entity, id }. Tudo restrito a ADMIN (checado na lib) e auditado.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const b = await req.json().catch(() => null);
  if (!b?.entity || !b?.action || !b?.id) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r: OpResult | undefined;
  const e = b.entity as string;
  const a = b.action as string;

  if (a === 'delete') {
    if (e === 'waste') r = await ops.deleteWasteEntry(user, b.id, ctx);
    else if (e === 'commandCount') r = await ops.deleteCommandCount(user, b.id, ctx);
    else if (e === 'commandDivergence') r = await ops.deleteCommandDivergence(user, b.id, ctx);
    else if (e === 'occurrence') r = await ops.deleteOccurrence(user, b.id, ctx);
    else if (e === 'cancellation') r = await ops.deleteCancellation(user, b.id, ctx);
    else if (e === 'cancellationImport') r = await ops.deleteCancellationImport(user, b.id, ctx);
    else if (e === 'note') r = await ops.deleteReceivedNote(user, b.id, ctx);
    else if (e === 'taskInstance') r = await ops.deleteTaskInstance(user, b.id, ctx);
    else if (e === 'communication') r = await ops.deleteCommunication(user, b.id, ctx);
    else if (e === 'gas') r = await ops.deleteGasReceipt(user, b.id, ctx);
    else if (e === 'inventory') r = await ops.deleteInventory(user, b.id, ctx);
  }

  if (!r) return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const msg =
      r.reason === 'FORBIDDEN' ? 'Apenas o Administrador' :
      r.reason === 'NOT_FOUND' ? 'Registro não encontrado' :
      'Dados inválidos';
    return NextResponse.json({ error: msg, reason: r.reason }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
