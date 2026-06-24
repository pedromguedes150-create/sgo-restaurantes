import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { remindPendingCommunication } from '@/lib/communications/notify';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const r = await remindPendingCommunication(user, params.id, requestContext(req));
  if (!r.ok) {
    return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Não encontrado' }, { status: r.reason === 'FORBIDDEN' ? 403 : 404 });
  }
  return NextResponse.json({ ok: true, reminded: r.reminded });
}
