import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { confirmInventory } from '@/lib/inventory';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const result = await confirmInventory(user, params.id, b.observation, requestContext(req));
  if (!result.ok) {
    const map: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, INVALID: 400, STATE: 409 };
    return NextResponse.json({ error: 'Falha', reason: result.reason }, { status: map[result.reason] });
  }
  return NextResponse.json({ ok: true });
}
