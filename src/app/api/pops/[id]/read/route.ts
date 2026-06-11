import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { confirmRead } from '@/lib/pops';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const r = await confirmRead(user, params.id, requestContext(req));
  if (!r.ok) return NextResponse.json({ error: 'POP não encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
