import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listNotificationsPage } from '@/lib/notifications';

/** Avisos do próprio usuário, paginados (menu suspenso da barra). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const limit = Number(sp.get('limit') ?? 20);
  const cursor = sp.get('cursor') || null;
  const r = await listNotificationsPage(user, { limit: Number.isFinite(limit) ? limit : 20, cursor });
  return NextResponse.json({
    itens: r.itens.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: n.read, critical: n.critical, module: n.module, createdAt: n.createdAt.toISOString() })),
    proximoCursor: r.proximoCursor,
    temMais: r.temMais,
    naoLidas: r.naoLidas,
  });
}
