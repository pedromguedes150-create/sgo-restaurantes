import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { setNoteStatus } from '@/lib/notes/create';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (b.status !== 'PAID' && b.status !== 'PROBLEM') return NextResponse.json({ error: 'Status inválido' }, { status: 400 });

  const result = await setNoteStatus(user, params.id, b.status, b.problemNote, requestContext(req));
  if (!result.ok) {
    const map: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, INVALID: 400 };
    return NextResponse.json({ error: result.reason === 'INVALID' ? 'Descreva o problema' : 'Falha', reason: result.reason }, { status: map[result.reason] });
  }
  return NextResponse.json({ ok: true });
}
