import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { resolveHygieneRequest, upsertHygieneLocation, toggleHygieneLocation, deleteHygieneLocation } from '@/lib/hygiene';

/** Gestão interna de higiene (autenticada): resolver solicitação + CRUD de locais. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  let r: { ok: boolean; reason?: string } | undefined;
  if (b.action === 'resolve') r = await resolveHygieneRequest(user, String(b.id ?? ''), requestContext(req));
  else if (b.action === 'locUpsert') r = await upsertHygieneLocation(user, { id: b.id ? String(b.id) : undefined, unitId: String(b.unitId ?? ''), name: String(b.name ?? '') });
  else if (b.action === 'locToggle') r = await toggleHygieneLocation(user, String(b.id ?? ''), Boolean(b.active));
  else if (b.action === 'locDelete') r = await deleteHygieneLocation(user, String(b.id ?? ''));

  if (!r) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  if (!r.ok) return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Dados inválidos' }, { status: r.reason === 'FORBIDDEN' ? 403 : 400 });
  return NextResponse.json({ ok: true });
}
