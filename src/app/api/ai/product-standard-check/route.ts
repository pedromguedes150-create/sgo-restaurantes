import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getSessionUser } from '@/lib/auth/session';
import { listProductStandards } from '@/lib/product-standards';
import { analyzeProductStandard, type ProductStandardRef } from '@/lib/ai/product-standard';

const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Confere a foto contra o catálogo de produtos-padrão (opcionalmente por categoria). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) return NextResponse.json({ error: 'Envie a foto' }, { status: 400 });

  const form = await req.formData();
  const file = form.get('photo');
  const category = (form.get('category') as string) || undefined;
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Foto inválida' }, { status: 400 });

  const standards = await listProductStandards({ activeOnly: true, category });
  if (standards.length === 0) return NextResponse.json({ configured: true, ok: false, error: 'Nenhum produto-padrão cadastrado. Cadastre em Configurações → Padrão de produtos.' });

  const refs: ProductStandardRef[] = [];
  for (const s of standards.slice(0, 6)) {
    let photoBase64: string | undefined; let mediaType: string | undefined;
    if (s.photoPath) {
      try {
        const buf = await readFile(path.join(process.cwd(), s.photoPath));
        photoBase64 = buf.toString('base64');
        mediaType = MIME_BY_EXT[(s.photoPath.split('.').pop() ?? '').toLowerCase()] ?? 'image/jpeg';
      } catch { /* sem foto */ }
    }
    refs.push({ name: s.name, description: s.description, photoBase64, mediaType });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mediaType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
  const r = await analyzeProductStandard({ photoBase64: buf.toString('base64'), mediaType, standards: refs });
  return NextResponse.json(r);
}
