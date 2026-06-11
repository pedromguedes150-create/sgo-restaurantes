import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createPop, type PopBlock } from '@/lib/pops';
import { youtubeId } from '@/lib/youtube';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.title) return NextResponse.json({ error: 'Informe o título' }, { status: 400 });

  const blocks: PopBlock[] = [];
  if (b.text) blocks.push({ type: 'text', text: String(b.text) });
  // Vídeos do YouTube (treinamento) — aceita lista; valida o ID
  const videos: string[] = Array.isArray(b.videos) ? b.videos : [];
  for (const v of videos) {
    const url = String(v).trim();
    if (url && youtubeId(url)) blocks.push({ type: 'video', url });
  }
  const r = await createPop(user, { title: b.title, category: b.category, sector: b.sector, blocks, unitIds: b.unitIds ?? [] }, requestContext(req));
  if (!r.ok) {
    return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Apenas Admin' : 'Informe título e unidades' }, { status: r.reason === 'FORBIDDEN' ? 403 : 400 });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
