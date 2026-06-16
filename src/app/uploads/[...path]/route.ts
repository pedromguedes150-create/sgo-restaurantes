import { getSessionUser } from '@/lib/auth/session';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf',
};

/** Serve arquivos do volume de uploads (somente autenticado; defesa contra path traversal). */
export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });

  // sanitiza cada segmento (sem "..", sem barras) e ignora um prefixo "uploads"
  const segs = (params.path ?? []).filter((s) => s && s !== 'uploads' && !s.includes('..') && !s.includes('/') && !s.includes('\\'));
  if (segs.length === 0) return new Response('Inválido', { status: 400 });
  const full = path.join(UPLOAD_ROOT, ...segs);
  if (!full.startsWith(UPLOAD_ROOT)) return new Response('Inválido', { status: 400 });

  try {
    const buf = await readFile(full);
    const ext = (segs[segs.length - 1].split('.').pop() ?? '').toLowerCase();
    return new Response(buf, {
      headers: { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' },
    });
  } catch {
    return new Response('Não encontrado', { status: 404 });
  }
}
