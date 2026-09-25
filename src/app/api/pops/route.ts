import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createPop, updatePop, deletePop, type PopBlock, type ModuleInput } from '@/lib/pops';
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
const strs = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map(String) : []);

/** Os MÓDULOS do POP. Corpo sem `modules` (cliente antigo) vira um módulo só com os campos de sempre. */
function modulesOf(b: Record<string, unknown>): ModuleInput[] {
  if (Array.isArray(b.modules)) {
    return (b.modules as Record<string, unknown>[]).map((m) => ({
      id: m.id ? String(m.id) : undefined,
      name: String(m.name ?? ''),
      allPublic: Boolean(m.allPublic),
      jobTitles: strs(m.jobTitles),
      collaboratorIds: strs(m.collaboratorIds),
      sectorNames: strs(m.sectorNames),
      blocks: buildBlocks(m),
    }));
  }
  return [{ name: 'Treinamento', allPublic: Boolean(b.isInitial), jobTitles: strs(b.jobTitles), collaboratorIds: strs(b.collaboratorIds), sectorNames: strs(b.sectorNames), blocks: buildBlocks(b) }];
}

function payload(b: Record<string, unknown>) {
  return {
    title: String(b.title ?? ''),
    category: b.category ? String(b.category) : undefined,
    unitIds: strs(b.unitIds),
    recurrence: b.recurrence === 'MONTHLY' ? ('MONTHLY' as const) : ('ONCE' as const),
    modules: modulesOf(b),
  };
}
function errStatus(reason?: string) { return reason === 'FORBIDDEN' ? 403 : 400; }
function errMsg(reason?: string) { return reason === 'FORBIDDEN' ? 'Apenas Admin' : 'Informe título, ao menos uma unidade e ao menos um módulo com nome'; }

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const b = await req.json().catch(() => null);
  if (!b?.title) return NextResponse.json({ error: 'Informe o título' }, { status: 400 });
  const r = await createPop(user, payload(b), requestContext(req));
  if (!r.ok) return NextResponse.json({ error: errMsg(r.reason) }, { status: errStatus(r.reason) });
  return NextResponse.json({ ok: true, id: r.id });
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const b = await req.json().catch(() => null);
  if (!b?.id || !b?.title) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await updatePop(user, String(b.id), { ...payload(b), bumpVersion: Boolean(b.bumpVersion) }, requestContext(req));
  if (!r.ok) return NextResponse.json({ error: errMsg(r.reason) }, { status: errStatus(r.reason) });
  return NextResponse.json({ ok: true, id: r.id, version: r.version });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await deletePop(user, String(b.id), requestContext(req));
  if (!r.ok) return NextResponse.json({ error: errMsg(r.reason) }, { status: errStatus(r.reason) });
  return NextResponse.json({ ok: true });
}
