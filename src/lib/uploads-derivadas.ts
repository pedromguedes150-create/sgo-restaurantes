import { mkdir, stat, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * DERIVADAS de imagem (v1.171.1) — a foto do celular pesa 3 a 12 MB, e até
 * aqui a Conferência de desperdício baixava o ORIGINAL para desenhar uma
 * miniatura de 80px. Dez lançamentos na tela = dezenas de MB; "as fotos
 * demoram muito para carregar" era isso.
 *
 * Duas larguras, e só duas (`LARGURAS`): miniatura (320px) para a grade e
 * tela (1600px) para a janela. O original continua no disco, intocado, e é o
 * que "Abrir em nova aba" entrega. A derivada é gerada UMA vez (na gravação,
 * em segundo plano) e guardada em `uploads/_derivadas/`; se ainda não existir
 * quando pedida, nasce na hora. Nome = original + largura: como o nome do
 * original já carrega o tamanho em bytes, nunca há conflito e o navegador
 * pode guardar em cache para sempre.
 *
 * `sharp` é dependência nativa (libvips). Formato que ele não decodifica (HEIC
 * do iPhone, por exemplo) ou qualquer falha → devolve `null` e a rota serve o
 * original: a miniatura fica lenta naquele caso, mas nunca quebra.
 */
export const LARGURAS = { miniatura: 320, tela: 1600 } as const;
export type Largura = (typeof LARGURAS)[keyof typeof LARGURAS];
export const LARGURAS_VALIDAS: readonly number[] = Object.values(LARGURAS);

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const PASTA = path.join(UPLOAD_ROOT, '_derivadas');
const EXTENSOES_DE_IMAGEM = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

export function ehImagem(nomeDoArquivo: string): boolean {
  return EXTENSOES_DE_IMAGEM.has((nomeDoArquivo.split('.').pop() ?? '').toLowerCase());
}

export function larguraValida(v: string | null | undefined): Largura | null {
  const n = Number(v);
  return LARGURAS_VALIDAS.includes(n) ? (n as Largura) : null;
}

/** Caminho em disco da derivada de um original (relativo a `uploads/`). */
export function caminhoDaDerivada(segmentos: string[], w: Largura): string {
  const base = segmentos.join('__').replace(/\.[^.]+$/, '');
  return path.join(PASTA, `${base}__w${w}.webp`);
}

/**
 * Devolve o caminho em disco da derivada, gerando-a se não existir.
 * `null` = não foi possível (não é imagem, formato sem decodificador, erro):
 * quem chama serve o original.
 */
export async function obterDerivada(segmentos: string[], w: Largura): Promise<string | null> {
  const nome = segmentos[segmentos.length - 1] ?? '';
  if (!ehImagem(nome)) return null;
  const alvo = caminhoDaDerivada(segmentos, w);
  try {
    const s = await stat(alvo);
    if (s.size > 0) return alvo;
  } catch { /* ainda não existe */ }
  return gerar(path.join(UPLOAD_ROOT, ...segmentos), alvo, w);
}

async function gerar(original: string, alvo: string, w: Largura): Promise<string | null> {
  try {
    const { default: sharp } = await import('sharp');
    await mkdir(PASTA, { recursive: true });
    /* `rotate()` sem argumento aplica a orientação EXIF: foto de celular em pé
       vinha deitada quando o navegador ignorava o EXIF do WebP. */
    await sharp(original, { failOn: 'none' })
      .rotate()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: w <= LARGURAS.miniatura ? 72 : 80 })
      .toFile(alvo);
    return alvo;
  } catch {
    await unlink(alvo).catch(() => {});
    return null;
  }
}

/** Gera as duas derivadas de um original recém-gravado (segundo plano, falha silenciosa). */
export async function gerarDerivadas(relPath: string): Promise<void> {
  const segs = relPath.split('/').filter((s) => s && s !== 'uploads');
  if (segs.length === 0 || !ehImagem(segs[segs.length - 1])) return;
  for (const w of LARGURAS_VALIDAS as Largura[]) await obterDerivada(segs, w);
}

/**
 * Apaga as derivadas de um original (quando o original é removido).
 * No Windows o arquivo que o libvips acabou de escrever pode ficar preso por
 * um instante (EPERM/EBUSY): tenta de novo algumas vezes antes de desistir.
 */
export async function removerDerivadas(segmentos: string[]): Promise<void> {
  for (const w of LARGURAS_VALIDAS as Largura[]) {
    const alvo = caminhoDaDerivada(segmentos, w);
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      try { await unlink(alvo); break; } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') break;
        if (tentativa === 4) break;
        await new Promise((r) => setTimeout(r, 60 * (tentativa + 1)));
      }
    }
  }
}

/** Quantas derivadas existem (diagnóstico/teste). */
export async function contarDerivadas(): Promise<number> {
  try { return (await readdir(PASTA)).length; } catch { return 0; }
}
