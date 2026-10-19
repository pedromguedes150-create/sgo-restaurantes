import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { urlDoUpload } from '@/lib/waste/foto-regra';
import {
  LARGURAS, larguraValida, ehImagem, caminhoDaDerivada, obterDerivada, gerarDerivadas, removerDerivadas,
} from '@/lib/uploads-derivadas';

/**
 * Fotos lentas (v1.171.1): a miniatura baixava o original de vários MB. Agora
 * `?w=` pede uma derivada webp, gerada uma vez e guardada em disco.
 */
const sfx = `drv${process.pid.toString(36)}`;
const UPLOADS = path.join(process.cwd(), 'uploads');
const dir = path.join(UPLOADS, sfx);
const segs = (nome: string) => [sfx, nome];

beforeAll(async () => {
  await mkdir(dir, { recursive: true });
  /* uma foto "de celular": 3000×2000, gradiente — grande o bastante para a derivada ser menor */
  const { default: sharp } = await import('sharp');
  await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 120, g: 80, b: 60 }, noise: { type: 'gaussian', mean: 128, sigma: 40 } } })
    .jpeg({ quality: 95 }).toFile(path.join(dir, 'foto-1.jpg'));
  await writeFile(path.join(dir, 'laudo.pdf'), '%PDF-1.4 teste');
});

afterAll(async () => {
  await removerDerivadas(segs('foto-1.jpg'));
  await rm(dir, { recursive: true, force: true });
});

describe('o endereço da foto', () => {
  it('sem largura é o original; com largura pede a derivada', () => {
    expect(urlDoUpload('uploads/u1/a.jpg')).toBe('/uploads/u1/a.jpg');
    expect(urlDoUpload('/uploads/u1/a.jpg', 320)).toBe('/uploads/u1/a.jpg?w=320');
    expect(urlDoUpload('uploads/u1/a.jpg', 1600)).toBe('/uploads/u1/a.jpg?w=1600');
  });
  it('só as duas larguras valem — qualquer outra cai no original', () => {
    expect(larguraValida('320')).toBe(LARGURAS.miniatura);
    expect(larguraValida('1600')).toBe(LARGURAS.tela);
    expect(larguraValida('999')).toBeNull();
    expect(larguraValida(null)).toBeNull();
    expect(larguraValida('abc')).toBeNull();
  });
  it('só imagem tem derivada', () => {
    expect(ehImagem('a.JPG')).toBe(true);
    expect(ehImagem('a.webp')).toBe(true);
    expect(ehImagem('laudo.pdf')).toBe(false);
    expect(ehImagem('video.mp4')).toBe(false);
  });
});

describe('a derivada', () => {
  it('é gerada uma vez, é webp, bem menor e com a largura pedida; a 2ª chamada reusa o arquivo', async () => {
    const original = await stat(path.join(dir, 'foto-1.jpg'));
    const p = await obterDerivada(segs('foto-1.jpg'), 320);
    expect(p).toBe(caminhoDaDerivada(segs('foto-1.jpg'), 320));
    const d = await stat(p!);
    expect(d.size).toBeGreaterThan(0);
    expect(d.size).toBeLessThan(original.size / 10);
    const { default: sharp } = await import('sharp');
    /* por BUFFER, não por caminho: sharp(caminho) mantém o arquivo aberto e no Windows o unlink do teste dá EBUSY */
    const meta = await sharp(await readFile(p!)).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(320);

    const antes = d.mtimeMs;
    const p2 = await obterDerivada(segs('foto-1.jpg'), 320);
    expect(p2).toBe(p);
    expect((await stat(p2!)).mtimeMs).toBe(antes); // não regerou
  });

  it('a versão de tela não amplia além do original e PDF não tem derivada', async () => {
    const p = await obterDerivada(segs('foto-1.jpg'), 1600);
    const { default: sharp } = await import('sharp');
    expect((await sharp(await readFile(p!)).metadata()).width).toBe(1600);
    expect(await obterDerivada(segs('laudo.pdf'), 320)).toBeNull();
    expect(await obterDerivada(segs('nao-existe.jpg'), 320)).toBeNull();
  });

  it('gerarDerivadas prepara as duas larguras a partir do caminho relativo; removerDerivadas limpa', async () => {
    await removerDerivadas(segs('foto-1.jpg'));
    await gerarDerivadas(`uploads/${sfx}/foto-1.jpg`);
    for (const w of [320, 1600] as const) expect((await stat(caminhoDaDerivada(segs('foto-1.jpg'), w))).size).toBeGreaterThan(0);
    await removerDerivadas(segs('foto-1.jpg'));
    await expect(stat(caminhoDaDerivada(segs('foto-1.jpg'), 320))).rejects.toThrow();
  });
});
