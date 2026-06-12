import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { markInProgress } from '@/lib/occurrences/close';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const result = await markInProgress(user, params.id, requestContext(req));
  if (!result.ok) {
    const map: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, INVALID: 400, ALREADY_CLOSED: 409 };
    return NextResponse.json({ error: 'Operação não permitida', reason: result.reason }, { status: map[result.reason] });
  }
  return NextResponse.json({ ok: true });
}
