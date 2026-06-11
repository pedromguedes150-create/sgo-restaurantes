import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createPop, type PopBlock } from '@/lib/pops';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.title) return NextResponse.json({ error: 'Informe o título' }, { status: 400 });

  const blocks: PopBlock[] = (b.text ? [{ type: 'text', text: String(b.text) }] : []) as PopBlock[];
  const r = await createPop(user, { title: b.title, category: b.category, sector: b.sector, blocks, unitIds: b.unitIds ?? [] }, requestContext(req));
  if (!r.ok) {
    return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Apenas Admin' : 'Informe título e unidades' }, { status: r.reason === 'FORBIDDEN' ? 403 : 400 });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
