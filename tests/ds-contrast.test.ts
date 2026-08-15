import { describe, it, expect } from 'vitest';
import {
  parseCssColor, composite, relativeLuminance, contrastRatio,
  isLargeText, requiredRatio, checkContrast, floor2,
} from '@/lib/ds/contrast';

const BRANCO = { r: 255, g: 255, b: 255, a: 1 };
const PRETO = { r: 0, g: 0, b: 0, a: 1 };

describe('parseCssColor', () => {
  it('lê o que o getComputedStyle devolve', () => {
    expect(parseCssColor('rgb(110, 20, 35)')).toEqual({ r: 110, g: 20, b: 35, a: 1 });
    expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it('lê a sintaxe moderna com barra', () => {
    expect(parseCssColor('rgb(10 20 30 / 0.4)')).toEqual({ r: 10, g: 20, b: 30, a: 0.4 });
  });

  it('lê hex de 3, 4, 6 e 8 dígitos', () => {
    expect(parseCssColor('#fff')).toEqual(BRANCO);
    expect(parseCssColor('#6E1423')).toEqual({ r: 110, g: 20, b: 35, a: 1 });
    expect(parseCssColor('#000f')).toEqual(PRETO);
    expect(parseCssColor('#00000080')?.a).toBeCloseTo(0.5, 1);
  });

  it('transparent é preto com alfa 0 — não é null', () => {
    expect(parseCssColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('devolve null para o que não sabe ler', () => {
    expect(parseCssColor('')).toBeNull();
    expect(parseCssColor(null)).toBeNull();
    expect(parseCssColor('vermelho')).toBeNull();
    expect(parseCssColor('rgb(1, 2)')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('preto sobre branco é 21:1 e a ordem não importa', () => {
    expect(contrastRatio(PRETO, BRANCO)).toBeCloseTo(21, 5);
    expect(contrastRatio(BRANCO, PRETO)).toBeCloseTo(21, 5);
  });

  it('cor igual a ela mesma é 1:1', () => {
    expect(contrastRatio(BRANCO, BRANCO)).toBeCloseTo(1, 5);
  });

  it('luminância do branco é 1 e do preto é 0', () => {
    expect(relativeLuminance(BRANCO)).toBeCloseTo(1, 5);
    expect(relativeLuminance(PRETO)).toBeCloseTo(0, 5);
  });
});

describe('as cores que a Onda 7 vai trocar', () => {
  const sobre = (hex: string) => contrastRatio(parseCssColor(hex)!, BRANCO);

  it('os tons do design system passam em AAA sobre branco', () => {
    expect(sobre('#7c1a2b')).toBeGreaterThanOrEqual(7); // --sgo-brand
    expect(sobre('#0a5c34')).toBeGreaterThanOrEqual(7); // --sgo-success
    expect(sobre('#a31515')).toBeGreaterThanOrEqual(7); // --sgo-danger
    expect(sobre('#7a4200')).toBeGreaterThanOrEqual(7); // --sgo-warning
  });

  it('os tons legados de status NÃO passam — é por isso que a migração existe', () => {
    // Números reais sobre branco. O âmbar e o verde não alcançam nem o 4,5:1
    // de texto grande; o vermelho passa em grande, mas nunca em texto normal.
    expect(sobre('#F59E0B')).toBeLessThan(4.5); // medium legado ≈ 2,15
    expect(sobre('#16A34A')).toBeLessThan(4.5); // success legado ≈ 3,30
    expect(sobre('#DC2626')).toBeLessThan(7); // critical legado ≈ 4,83
  });

  it('bordô e grafite legados já passavam — o problema não é a marca', () => {
    expect(sobre('#6E1423')).toBeGreaterThanOrEqual(7); // ≈ 11,75
    expect(sobre('#3F3F46')).toBeGreaterThanOrEqual(7); // ≈ 10,44
  });

  it('bordô da marca sobre card escuro é ilegível — o bloqueio do modo escuro', () => {
    const cardEscuro = parseCssColor('#1f1c1b')!;
    expect(contrastRatio(parseCssColor('#6E1423')!, cardEscuro)).toBeLessThan(2);
    // O tom claro do tema escuro resolve.
    expect(contrastRatio(parseCssColor('#f0a7b1')!, cardEscuro)).toBeGreaterThanOrEqual(7);
  });
});

describe('texto grande', () => {
  it('≥24px é grande em qualquer peso', () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(23, 400)).toBe(false);
  });

  it('≥18,66px só é grande quando bold', () => {
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 600)).toBe(false);
    expect(isLargeText(18, 700)).toBe(false);
  });

  it('o alvo cai de 7 para 4,5 quando o texto é grande', () => {
    expect(requiredRatio(14, 400)).toBe(7);
    expect(requiredRatio(28, 400)).toBe(4.5);
  });
});

describe('composite e checkContrast', () => {
  it('50% de preto sobre branco vira cinza médio', () => {
    expect(composite({ r: 0, g: 0, b: 0, a: 0.5 }, BRANCO)).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  });

  it('alfa 0 some por completo', () => {
    expect(composite({ r: 0, g: 0, b: 0, a: 0 }, BRANCO)).toEqual({ ...BRANCO });
  });

  it('texto com alfa é medido DEPOIS de composto, não pelo valor cru', () => {
    const meioPreto = { r: 0, g: 0, b: 0, a: 0.5 };
    const c = checkContrast(meioPreto, BRANCO, 14, 400);
    expect(c.ratio).toBeLessThan(21); // se ignorasse o alfa, daria 21
    expect(c.ratio).toBeCloseTo(3.94, 1);
    expect(c.passes).toBe(false);
  });

  it('arredonda para baixo — 6,999 não vira 7 aprovado', () => {
    expect(floor2(6.999)).toBe(6.99);
    expect(floor2(7.004)).toBe(7);
  });

  it('o alvo depende do tamanho: o vermelho legado só passa em texto grande', () => {
    const vermelho = parseCssColor('#DC2626')!; // ≈ 4,83 sobre branco
    expect(checkContrast(vermelho, BRANCO, 14, 400).passes).toBe(false); // alvo 7
    expect(checkContrast(vermelho, BRANCO, 28, 400).passes).toBe(true); // alvo 4,5
  });

  it('o verde legado não se salva nem em texto grande', () => {
    const verde = parseCssColor('#16A34A')!; // ≈ 3,30
    expect(checkContrast(verde, BRANCO, 28, 400).passes).toBe(false);
    expect(checkContrast(parseCssColor('#0a5c34')!, BRANCO, 14, 400).passes).toBe(true);
  });
});
