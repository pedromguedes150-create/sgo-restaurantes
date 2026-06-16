import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { analyzeChecklistPhoto } from '@/lib/ai/vision';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

/** Analisa a foto de um item de checklist (aiCheck) contra o padrão esperado. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const itemId = String(form.get('itemId') ?? '');
  const file = form.get('photo');
  if (!itemId || !(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Envie a foto e o item' }, { status: 400 });

  const item = await prisma.checklistItem.findUnique({ where: { id: itemId }, select: { aiCheck: true, standardDescription: true, referenceImagePath: true } });
  if (!item || !item.aiCheck || !item.standardDescription) {
    return NextResponse.json({ error: 'Este item não tem checagem por IA configurada' }, { status: 400 });
  }

  const photoBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');

  // imagem de referência (se cadastrada)
  let referenceBase64: string | undefined;
  let referenceMediaType: string | undefined;
  if (item.referenceImagePath) {
    try {
      const segs = item.referenceImagePath.split('/').filter((s) => s && s !== 'uploads' && !s.includes('..'));
      const buf = await readFile(path.join(UPLOAD_ROOT, ...segs));
      referenceBase64 = buf.toString('base64');
      const ext = (segs[segs.length - 1].split('.').pop() ?? '').toLowerCase();
      referenceMediaType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    } catch { /* referência ausente — segue só com o padrão em texto */ }
  }

  const r = await analyzeChecklistPhoto({ photoBase64, mediaType: file.type || 'image/jpeg', standardDescription: item.standardDescription, referenceBase64, referenceMediaType });

  if (!r.configured) return NextResponse.json({ configured: false, error: 'IA não configurada (defina ANTHROPIC_API_KEY no servidor).' }, { status: 200 });
  if (!r.ok) return NextResponse.json({ configured: true, error: r.error ?? 'Falha na IA' }, { status: 200 });
  return NextResponse.json({ configured: true, verdict: r.verdict, observations: r.observations });
}
