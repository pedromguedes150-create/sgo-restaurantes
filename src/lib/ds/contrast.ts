/**
 * Contraste WCAG (Onda 7) — lógica pura, sem DOM, para ser testável.
 *
 * Existe para a migração de cores: são ~2.100 usos de classe trocando de valor
 * ao mesmo tempo, e print não mede contraste. O caminhador de DOM que usa isto
 * está em scripts/audit-contrast.js.
 *
 * Regra 3 do contrato do redesign: AAA ≥7:1 para texto normal e ≥4,5:1 para
 * texto grande (≥24px, ou ≥18,66px quando bold).
 */
export interface Rgba { r: number; g: number; b: number; a: number }

/**
 * Aceita o que o getComputedStyle devolve — sempre rgb()/rgba() nos
 * navegadores — e também hex, que aparece quando a origem é um token.
 */
export function parseCssColor(input: string | null | undefined): Rgba | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const fn = s.match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    // Aceita tanto "r, g, b" quanto a sintaxe moderna "r g b / a".
    const parts = fn[1].replace(/\//g, ' ').split(/[\s,]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
    const a = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1;
    return { r: clamp255(parts[0]), g: clamp255(parts[1]), b: clamp255(parts[2]), a: clamp01(a) };
  }

  const hex = s.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const h = hex[1];
    const dup = (c: string) => parseInt(c + c, 16);
    if (h.length === 3 || h.length === 4) {
      return { r: dup(h[0]), g: dup(h[1]), b: dup(h[2]), a: h.length === 4 ? dup(h[3]) / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      const at = (i: number) => parseInt(h.slice(i, i + 2), 16);
      return { r: at(0), g: at(2), b: at(4), a: h.length === 8 ? at(6) / 255 : 1 };
    }
  }
  return null;
}

const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Compõe `fg` (com alfa) sobre `bg` OPACO e devolve a cor resultante. */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = clamp01(fg.a);
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

export function relativeLuminance({ r, g, b }: Rgba): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Razão WCAG, de 1 (igual) a 21 (preto sobre branco). Ordem não importa. */
export function contrastRatio(c1: Rgba, c2: Rgba): number {
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * "Texto grande" do WCAG: ≥24px, ou ≥18,66px quando bold (peso ≥700).
 * Abaixo disso o alvo AAA é 7:1.
 */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  if (fontSizePx >= 24) return true;
  return fontWeight >= 700 && fontSizePx >= 18.66;
}

export const requiredRatio = (fontSizePx: number, fontWeight: number): number =>
  (isLargeText(fontSizePx, fontWeight) ? 4.5 : 7);

/** Arredonda para 2 casas SEM subir: 6,999 não pode virar "7,00 ✓". */
export const floor2 = (n: number) => Math.floor(n * 100) / 100;

export interface ContrastCheck {
  ratio: number;
  required: number;
  passes: boolean;
  large: boolean;
}

export function checkContrast(fg: Rgba, bg: Rgba, fontSizePx: number, fontWeight: number): ContrastCheck {
  // Texto com alfa (ex.: text-ink-500/70) só é legível depois de composto.
  const solidFg = fg.a < 1 ? composite(fg, bg) : fg;
  const ratio = floor2(contrastRatio(solidFg, bg));
  const required = requiredRatio(fontSizePx, fontWeight);
  return { ratio, required, passes: ratio >= required, large: isLargeText(fontSizePx, fontWeight) };
}
