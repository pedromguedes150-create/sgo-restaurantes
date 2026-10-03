import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { deleteNotification } from '@/lib/notifications';

/** Apaga UM aviso do próprio usuário (o de outro usuário não é encontrado). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const ok = await deleteNotification(user, params.id);
  if (!ok) return NextResponse.json({ error: 'Aviso não encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
