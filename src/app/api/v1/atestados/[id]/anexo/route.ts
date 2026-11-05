import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { comApiKey } from '@/lib/api-global/guarda';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', pdf: 'application/pdf' };

/**
 * GET /api/v1/atestados/{id}/anexo — a imagem/PDF do atestado, pela mesma
 * X-API-Key da API Global (v1.190.0, pedido do RH: "fileUrl como reserva").
 * É o `fileUrl` que /api/v1/atestados devolve. Mesma defesa de caminho da rota
 * /uploads (sem "..", sem barras, dentro do volume); 404 sem anexo.
 */
export const GET = comApiKey(async (req) => {
  const id = new URL(req.url).pathname.split('/').filter(Boolean)[3] ?? '';
  const c = await prisma.medicalCertificate.findUnique({ where: { id }, select: { attachmentPath: true } });
  if (!c?.attachmentPath) return new Response('Atestado sem anexo', { status: 404 });
  const segs = c.attachmentPath.split('/').filter((s) => s && s !== 'uploads' && !s.includes('..') && !s.includes('\\'));
  if (segs.length === 0) return new Response('Anexo inválido', { status: 404 });
  const full = path.join(UPLOAD_ROOT, ...segs);
  if (!full.startsWith(UPLOAD_ROOT)) return new Response('Anexo inválido', { status: 404 });
  try {
    const info = await stat(full);
    const tipo = TYPES[(segs[segs.length - 1].split('.').pop() ?? '').toLowerCase()] ?? 'application/octet-stream';
    return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, { headers: { 'Content-Type': tipo, 'Content-Length': String(info.size), 'Cache-Control': 'private, no-store' } });
  } catch {
    return new Response('Arquivo do anexo não encontrado', { status: 404 });
  }
});
