import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { markRead, markAllRead } from '@/lib/notifications';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (b?.all) await markAllRead(user);
  else if (b?.id) await markRead(user, b.id);
  else return NextResponse.json({ error: 'Informe id ou all' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
