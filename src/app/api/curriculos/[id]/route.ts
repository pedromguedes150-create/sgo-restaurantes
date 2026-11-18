import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getCurriculo } from '@/lib/curriculos/curriculos';

export const dynamic = 'force-dynamic';

/** A linha do tempo de um currículo — só para quem alcança a unidade dele. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const c = await getCurriculo(user, params.id);
  if (!c) return NextResponse.json({ error: 'Currículo não encontrado' }, { status: 404 });
  return NextResponse.json({
    id: c.id,
    eventos: c.events.map((e) => ({ id: e.id, kind: e.kind, fromStatus: e.fromStatus, toStatus: e.toStatus, note: e.note, origem: e.origem, actorName: e.actorName, createdAt: e.createdAt.toISOString() })),
  });
}
