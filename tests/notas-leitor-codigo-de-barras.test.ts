import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BinaryBitmap, Code128Reader, DecodeHintType, BarcodeFormat, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from '@zxing/library';
import { dicasDoLeitor, RESTRICOES_DA_CAMERA, tamanhoDoQuadro, LADO_MAXIMO_DO_QUADRO } from '@/lib/notes/leitura-codigo';
import { chaveConfere } from '@/lib/notes/chave';

/** Chave sintética que confere (UF 31, 11/2026, CNPJ de exemplo). */
const CHAVE = (() => {
  const base = '3126110000000000019155001000012345100012345';
  let peso = 2, soma = 0;
  for (let i = base.length - 1; i >= 0; i--) { soma += Number(base[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return base + String(r < 2 ? 0 : 11 - r);
})();

/** As barras do Code-128 (conjunto C) da chave, como a DANFE imprime. */
function barras(chave: string): boolean[] {
  const P = (Code128Reader as unknown as { CODE_PATTERNS: number[][] }).CODE_PATTERNS;
  const codes = [105];
  for (let i = 0; i < chave.length; i += 2) codes.push(Number(chave.slice(i, i + 2)));
  let chk = 105;
  for (let i = 1; i < codes.length; i++) chk += codes[i] * i;
  codes.push(chk % 103, 106);
  const bits: boolean[] = [];
  for (const c of codes) { let preto = true; for (const larg of P[c]) { for (let k = 0; k < larg; k++) bits.push(preto); preto = !preto; } }
  return bits;
}

/** Um quadro da câmera com o código numa faixa: topo e largura em fração da tela. */
function quadro(W: number, H: number, topo: number, fracaoDaLargura: number): Uint8ClampedArray {
  const bits = barras(CHAVE), margem = 12, mods = bits.length + margem * 2;
  const px = (W * fracaoDaLargura) / mods;
  const larg = Math.round(mods * px), x0 = Math.round((W - larg) / 2);
  const buf = new Uint8ClampedArray(W * H).fill(235);
  const y0 = Math.round(H * topo), y1 = Math.round(H * (topo + 0.07));
  for (let x = 0; x < larg; x++) {
    let s = 0;
    for (let k = 0; k < 4; k++) { const m = Math.floor((x + k / 4) / px) - margem; s += m >= 0 && m < bits.length && bits[m] ? 30 : 235; }
    for (let y = y0; y < y1; y++) buf[y * W + x0 + x] = s / 4;
  }
  return buf;
}

function ler(buf: Uint8ClampedArray, W: number, H: number, dicas: Map<DecodeHintType, unknown>): string | null {
  try { return new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(buf, W, H))), dicas).getText(); }
  catch { return null; }
}

describe('leitor de código de barras da nota (v1.223.1)', () => {
  it('a chave de teste confere', () => expect(chaveConfere(CHAVE)).toBe(true));

  it('lê o código no ALTO da tela — onde a gerente aponta a folha', () => {
    const W = 1080, H = 1920;
    expect(ler(quadro(W, H, 0.12, 0.8), W, H, dicasDoLeitor())).toBe(CHAVE);
  });

  it('sem a varredura inteira, o código no alto da tela não era lido', () => {
    const W = 1080, H = 1920;
    const antigas = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128]]]);
    expect(ler(quadro(W, H, 0.12, 0.8), W, H, antigas)).toBeNull();
  });

  it('na resolução padrão da câmera (480 de largura) não há pixel por barra: por isso pedimos mais', () => {
    const W = 480, H = 640;
    expect(ler(quadro(W, H, 0.45, 0.9), W, H, dicasDoLeitor())).toBeNull();
    expect((RESTRICOES_DA_CAMERA.width as { ideal: number }).ideal).toBeGreaterThanOrEqual(1920);
    expect(RESTRICOES_DA_CAMERA.facingMode).toBe('environment');
  });

  it('o quadro lido respeita o teto sem deformar', () => {
    expect(tamanhoDoQuadro(1080, 1920)).toEqual({ largura: 1080, altura: 1920 });
    const q = tamanhoDoQuadro(2160, 3840);
    expect(Math.max(q.largura, q.altura)).toBe(LADO_MAXIMO_DO_QUADRO);
    expect(q.largura / q.altura).toBeCloseTo(2160 / 3840, 2);
  });

  it('a tela do leitor usa as restrições e as dicas — e ainda abre se o aparelho recusar', () => {
    const fonte = readFileSync('src/components/notes/qr-scanner.tsx', 'utf8');
    expect(fonte).toContain('video: RESTRICOES_DA_CAMERA');
    expect(fonte).toContain('new BrowserMultiFormatReader(dicasDoLeitor())');
    expect(fonte).toContain("video: { facingMode: 'environment' }");
  });
});
