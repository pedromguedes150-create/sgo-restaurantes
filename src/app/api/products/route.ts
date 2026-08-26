import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createProductRequests, setRequestStatus, upsertProduct, toggleProduct, deleteProduct } from '@/lib/products';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r: { ok: boolean; reason?: string } | undefined;
  if (b.action === 'order') r = await createProductRequests(user, String(b.unitId ?? ''), Array.isArray(b.items) ? b.items : [], b.note, ctx);
  else if (b.action === 'status') r = await setRequestStatus(user, String(b.id ?? ''), String(b.status ?? ''), ctx);
  else if (b.action === 'catUpsert') r = await upsertProduct(user, {
    id: b.id ? String(b.id) : undefined, name: String(b.name ?? ''), origin: String(b.origin ?? ''),
    category: b.category, measure: b.measure,
    /* undefined = "nao mexe"; null = "apaga". A distincao importa ao editar um
       produto que ja tem codigo de barras. */
    ...(b.packSize !== undefined ? { packSize: b.packSize === null ? null : Number(b.packSize) } : {}),
    ...(b.barcode !== undefined ? { barcode: b.barcode === null ? null : String(b.barcode) } : {}),
  });
  else if (b.action === 'catToggle') r = await toggleProduct(user, String(b.id ?? ''), Boolean(b.active));
  else if (b.action === 'catDelete') r = await deleteProduct(user, String(b.id ?? ''));

  if (!r) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  if (!r.ok) return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Dados inválidos' }, { status: r.reason === 'FORBIDDEN' ? 403 : 400 });
  return NextResponse.json({ ok: true });
}
