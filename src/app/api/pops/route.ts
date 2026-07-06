import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createPop, updatePop, deletePop, type PopBlock } from '@/lib/pops';
import { youtubeId } from '@/lib/youtube';

function buildBlocks(b: Record<string, unknown>): PopBlock[] {
  // Formato novo (editor de blocos): usa direto os blocos enviados.
  if (Array.isArray(b.blocks)) return b.blocks as PopBlock[];
  // Fallback legado: texto único + vídeos.
  const blocks: PopBlock[] = [];
  if (b.text) blocks.push({ type: 'text', text: String(b.text) });
  const videos: string[] = Array.isArray(b.videos) ? (b.videos as string[]) : [];
  for (const v of videos) {
    const url = String(v).trim();
    if (url && youtubeId(url)) blocks.push({ type: 'video', url });
  }
  return blocks;
}
function payload(b: Record<string, unknown>) {
  return {
    title: String(b.title ?? ''),
    category: b.category ? String(b.category) : undefined,
    blocks: buildBlocks(b),
    unitIds: Array.isArray(b.unitIds) ? (b.unitIds as string[]) : [],
    isInitial: Boolean(b.isInitial),
    recurrence: b.recurrence === 'MONTHLY' ? ('MONTHLY' as const) : ('ONCE' as const),
    sectorNames: Array.isArray(b.sectorNames) ? (b.sectorNames as string[]) : [],
  };
}
function errStatus(reason?: string) { return reason === 'FORBIDDEN' ? 403 : 400; }
function errMsg(reason?: string) { return reason === 'FORBIDDEN' ? 'Apenas Admin' : 'Informe título e ao menos uma unidade'; }

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.title) return NextResponse.json({ error: 'Informe o título' }, { status: 400 });
  const r = await createPop(user, payload(b), requestContext(req));
  if (!r.ok) return NextResponse.json({ error: errMsg(r.reason) }, { status: errStatus(r.reason) });
  return NextResponse.json({ ok: true, id: r.id });
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.id || !b?.title) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await updatePop(user, String(b.id), { ...payload(b), bumpVersion: Boolean(b.bumpVersion) }, requestContext(req));
  if (!r.ok) return NextResponse.json({ error: errMsg(r.reason) }, { status: errStatus(r.reason) });
  return NextResponse.json({ ok: true, id: r.id, version: r.version });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await deletePop(user, String(b.id), requestContext(req));
  if (!r.ok) return NextResponse.json({ error: errMsg(r.reason) }, { status: errStatus(r.reason) });
  return NextResponse.json({ ok: true });
}
