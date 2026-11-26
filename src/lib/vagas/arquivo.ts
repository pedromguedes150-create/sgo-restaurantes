import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { CURRICULO_MAX_BYTES, MIME_DO_ARQUIVO, tipoDoArquivo } from '@/lib/vagas/regras';

/**
 * O ARQUIVO DO CURRÍCULO DA VAGA — dado pessoal de quem nem é funcionário.
 * Mora em `uploads/_privado/vagas/<unidade>/` (a rota genérica `/uploads/…`
 * recusa `_privado`) e só sai pela rota da vaga, que confere a permissão e a
 * unidade, ou no corpo do envio ao RH.
 */
const RAIZ = path.join(process.cwd(), 'uploads');
export class ArquivoInvalido extends Error {}
const seguro = (v: string) => (v ?? '').replace(/[^a-zA-Z0-9_-]/g, '');

export interface ArquivoGuardado { path: string; mime: string; tamanho: number; nomeArquivo: string }

export async function guardarCurriculoDaVaga(file: File, unitId: string): Promise<ArquivoGuardado> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength === 0) throw new ArquivoInvalido(`"${file.name}" está vazio.`);
  if (buf.byteLength > CURRICULO_MAX_BYTES) throw new ArquivoInvalido(`"${file.name}" passa de 10 MB.`);
  const tipo = tipoDoArquivo(buf.subarray(0, 8), file.name);
  if (!tipo) throw new ArquivoInvalido(`"${file.name}": formato não aceito. Envie PDF, JPG, PNG, DOC ou DOCX.`);
  const unidade = seguro(unitId);
  if (!unidade) throw new ArquivoInvalido('Unidade inválida.');
  const dir = path.join(RAIZ, '_privado', 'vagas', unidade);
  await mkdir(dir, { recursive: true });
  const nome = `cv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${tipo}`;
  await writeFile(path.join(dir, nome), buf);
  const nomeArquivo = (file.name || `curriculo.${tipo}`).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 120) || `curriculo.${tipo}`;
  return { path: path.posix.join('uploads', '_privado', 'vagas', unidade, nome), mime: MIME_DO_ARQUIVO[tipo], tamanho: buf.byteLength, nomeArquivo };
}

function noDisco(rel: string): string | null {
  const segs = rel.split('/').filter((s) => s && s !== 'uploads');
  if (segs.length !== 4 || segs[0] !== '_privado' || segs[1] !== 'vagas' || segs.some((s) => s.includes('..') || s.includes('\\'))) return null;
  const full = path.join(RAIZ, ...segs);
  return full.startsWith(RAIZ) ? full : null;
}

export async function apagarArquivo(rel: string): Promise<void> {
  const full = noDisco(rel);
  if (full) await unlink(full).catch(() => {});
}

/** O conteúdo em base64, para o corpo do envio ao RH. Nulo se o arquivo sumiu do volume. */
export async function emBase64(rel: string): Promise<string | null> {
  const full = noDisco(rel);
  if (!full) return null;
  try { return (await readFile(full)).toString('base64'); } catch { return null; }
}

/** A resposta com o arquivo, em fluxo. Quem chama já conferiu o acesso. */
export async function respostaComArquivo(rel: string, mime: string, nomeArquivo: string): Promise<Response> {
  const full = noDisco(rel);
  if (!full) return new Response('Arquivo inválido', { status: 404 });
  try {
    const info = await stat(full);
    const nome = nomeArquivo.normalize('NFD').replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'curriculo';
    const inline = mime === 'application/pdf' || mime.startsWith('image/');
    return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(info.size),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${nome}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Arquivo não encontrado', { status: 404 });
  }
}
