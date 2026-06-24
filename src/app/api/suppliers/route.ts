import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import * as sup from '@/lib/suppliers';

/** CRUD de fornecedores (lista compartilhada). body: { action, ... }. Admin/CEO/Supervisor. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r: sup.SupplierResult | undefined;
  if (b.action === 'create') r = await sup.createSupplier(user, b, ctx);
  else if (b.action === 'update') r = await sup.updateSupplier(user, b.id, b, ctx);
  else if (b.action === 'toggle') r = await sup.toggleSupplier(user, b.id, b.active, ctx);
  else if (b.action === 'delete') r = await sup.deleteSupplier(user, b.id, ctx);

  if (!r) return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, BLOCKED: 409 };
    const msg = r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'BLOCKED' ? 'Fornecedor em uso (gás/notas/pagamentos): inative em vez de excluir.' : 'Dados inválidos';
    return NextResponse.json({ error: msg, reason: r.reason }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
