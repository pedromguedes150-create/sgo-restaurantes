import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { MIME_DO_TIPO, tipoPeloConteudo } from '@/lib/curriculos/regras';
import { ANEXO_MAX_BYTES } from '@/lib/rh/solicitacoes-regras';

/**
 * ANEXOS DA SOLICITAÇÃO AO RH (v1.217.0). Moram em
 * `uploads/_privado/solicitacoes-rh/<unidade>/` — fora da rota genérica
 * `/uploads/…`, que entrega a qualquer logado. Só saem pela rota da
 * solicitação, que confere a matriz e o escopo por unidade.
 *
 * O tipo é decidido pelo CONTEÚDO (PDF/JPG/PNG), como nos currículos.
 */
const RAIZ = path.join(process.cwd(), 'uploads');
const PASTA = ['_privado', 'solicitacoes-rh'];

export class AnexoInvalido extends Error {}
export interface AnexoGuardado { path: string; mime: string; nome: string; tamanho: number }

const seguro = (v: string) => (v ?? '').replace(/[^a-zA-Z0-9_-]/g, '');

export async function guardarAnexo(file: File, unitId: string): Promise<AnexoGuardado> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength === 0) throw new AnexoInvalido('Um dos anexos está vazio.');
  if (buf.byteLength > ANEXO_MAX_BYTES) throw new AnexoInvalido('Anexo muito grande (máximo 10 MB cada).');
  const tipo = tipoPeloConteudo(buf.subarray(0, 8));
  if (!tipo) throw new AnexoInvalido('Formato não aceito. Envie PDF, JPG ou PNG.');
  const unidade = seguro(unitId);
  if (!unidade) throw new AnexoInvalido('Unidade inválida.');
  const dir = path.join(RAIZ, ...PASTA, unidade);
  await mkdir(dir, { recursive: true });
  const arquivo = `sol-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${buf.byteLength}.${tipo}`;
  await writeFile(path.join(dir, arquivo), buf);
  const nome = (file.name || 'anexo').replace(/[\\/\r\n"]/g, ' ').trim().slice(0, 80) || 'anexo';
  return { path: path.posix.join('uploads', ...PASTA, unidade, arquivo), mime: MIME_DO_TIPO[tipo], nome, tamanho: buf.byteLength };
}

function caminhoNoDisco(rel: string): string | null {
  const segs = rel.split('/').filter((s) => s && s !== 'uploads');
  if (segs.length !== 4 || segs[0] !== PASTA[0] || segs[1] !== PASTA[1] || segs.some((s) => s.includes('..') || s.includes('\\'))) return null;
  const full = path.join(RAIZ, ...segs);
  return full.startsWith(RAIZ) ? full : null;
}

export async function removerAnexo(rel: string): Promise<void> {
  const full = caminhoNoDisco(rel);
  if (full) await unlink(full).catch(() => {});
}

/** A resposta com o arquivo, em fluxo. Quem chama já conferiu o acesso. */
export async function respostaComAnexo(a: AnexoGuardado): Promise<Response> {
  const full = caminhoNoDisco(a.path);
  if (!full) return new Response('Arquivo inválido', { status: 404 });
  try {
    const info = await stat(full);
    const ext = full.split('.').pop() ?? 'pdf';
    const base = a.nome.replace(/\.[a-zA-Z0-9]{2,5}$/, '').normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'anexo';
    return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, {
      headers: {
        'Content-Type': a.mime,
        'Content-Length': String(info.size),
        'Content-Disposition': `inline; filename="${base}.${ext}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Arquivo não encontrado', { status: 404 });
  }
}
