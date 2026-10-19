import { getSessionUser } from '@/lib/auth/session';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { larguraValida, obterDerivada } from '@/lib/uploads-derivadas';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf',
};

/**
 * Serve arquivos do volume de uploads (somente autenticado; defesa contra path traversal).
 *
 * v1.171.1 — `?w=320|1600` entrega uma DERIVADA redimensionada (webp) em vez
 * do original de vários MB; sem `w`, ou quando a derivada não pode ser gerada,
 * sai o original. O corpo vai em FLUXO (não mais `readFile` inteiro na
 * memória) e com cache longo: o nome do arquivo carrega o tamanho em bytes,
 * então um mesmo endereço nunca muda de conteúdo.
 */
export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });

  // sanitiza cada segmento (sem "..", sem barras) e ignora um prefixo "uploads"
  const segs = (params.path ?? []).filter((s) => s && s !== 'uploads' && !s.includes('..') && !s.includes('/') && !s.includes('\\'));
  if (segs.length === 0 || segs[0] === '_derivadas') return new Response('Inválido', { status: 400 });
  const full = path.join(UPLOAD_ROOT, ...segs);
  if (!full.startsWith(UPLOAD_ROOT)) return new Response('Inválido', { status: 400 });

  const w = larguraValida(new URL(req.url).searchParams.get('w'));
  let arquivo = full;
  let tipo = TYPES[(segs[segs.length - 1].split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream';
  if (w) {
    const derivada = await obterDerivada(segs, w);
    if (derivada) { arquivo = derivada; tipo = 'image/webp'; }
  }

  try {
    const info = await stat(arquivo);
    const corpo = Readable.toWeb(createReadStream(arquivo)) as ReadableStream;
    return new Response(corpo, {
      headers: {
        'Content-Type': tipo,
        'Content-Length': String(info.size),
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Não encontrado', { status: 404 });
  }
}
