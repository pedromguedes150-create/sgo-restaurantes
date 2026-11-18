import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { ARQUIVO_MAX_BYTES, MIME_DO_TIPO, tipoPeloConteudo } from '@/lib/curriculos/regras';

/**
 * O ARQUIVO DO CURRÍCULO (v1.212.0) — dado pessoal de quem nem é funcionário.
 *
 * Mora em `uploads/_privado/curriculos/<unidade>/`, e NÃO na pasta comum da
 * unidade: a rota genérica `/uploads/…` entrega arquivo a qualquer usuário
 * logado e recusa o prefixo `_privado`. O currículo só sai por duas rotas,
 * cada uma com a sua conferência: a da sessão (escopo por unidade) e a da API
 * Global (chave com a leitura de currículos liberada).
 */
const RAIZ = path.join(process.cwd(), 'uploads');
export const PASTA_PRIVADA = '_privado';

export class ArquivoInvalido extends Error {}

const seguro = (v: string) => (v ?? '').replace(/[^a-zA-Z0-9_-]/g, '');

export async function guardarCurriculo(file: File, unitId: string): Promise<{ path: string; mime: string }> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength === 0) throw new ArquivoInvalido('O arquivo está vazio.');
  if (buf.byteLength > ARQUIVO_MAX_BYTES) throw new ArquivoInvalido('Arquivo muito grande (máximo 15 MB).');
  const tipo = tipoPeloConteudo(buf.subarray(0, 8));
  if (!tipo) throw new ArquivoInvalido('Formato não aceito. Envie o currículo em PDF, JPG ou PNG.');
  const unidade = seguro(unitId);
  if (!unidade) throw new ArquivoInvalido('Unidade inválida.');
  const dir = path.join(RAIZ, PASTA_PRIVADA, 'curriculos', unidade);
  await mkdir(dir, { recursive: true });
  const nome = `cv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${buf.byteLength}.${tipo}`;
  await writeFile(path.join(dir, nome), buf);
  return { path: path.posix.join('uploads', PASTA_PRIVADA, 'curriculos', unidade, nome), mime: MIME_DO_TIPO[tipo] };
}

function caminhoNoDisco(rel: string): string | null {
  const segs = rel.split('/').filter((s) => s && s !== 'uploads');
  if (segs.length !== 4 || segs[0] !== PASTA_PRIVADA || segs[1] !== 'curriculos' || segs.some((s) => s.includes('..') || s.includes('\\'))) return null;
  const full = path.join(RAIZ, ...segs);
  return full.startsWith(RAIZ) ? full : null;
}

export async function removerCurriculo(rel: string): Promise<void> {
  const full = caminhoNoDisco(rel);
  if (full) await unlink(full).catch(() => {});
}

/** A resposta com o arquivo, em fluxo. Quem chama já conferiu o acesso. */
export async function respostaComCurriculo(rel: string, mime: string, nomeParaBaixar: string): Promise<Response> {
  const full = caminhoNoDisco(rel);
  if (!full) return new Response('Arquivo inválido', { status: 404 });
  try {
    const info = await stat(full);
    const ext = full.split('.').pop() ?? 'pdf';
    const nome = `${nomeParaBaixar.normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'curriculo'}.${ext}`;
    return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(info.size),
        'Content-Disposition': `inline; filename="${nome}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Arquivo não encontrado', { status: 404 });
  }
}
