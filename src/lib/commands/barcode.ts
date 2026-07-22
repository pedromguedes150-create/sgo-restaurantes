/**
 * Leitura do código de barras da comanda.
 *
 * O leitor do caixa funciona como TECLADO: ao bipar, ele "digita" o código e dá
 * Enter. O que vem nesse código varia por gráfica/etiqueta (pode ser o número
 * puro, com zeros à esquerda, com prefixo da unidade, ou um EAN-13 com dígito
 * verificador). Enquanto não temos um exemplo real do padrão da rede, o parser é
 * TOLERANTE: testa as leituras mais prováveis contra a sequência ativa da
 * unidade e aceita a primeira que existir de verdade.
 *
 * Isso é seguro porque a sequência ativa é a fonte da verdade: um palpite só é
 * aceito se corresponder a uma comanda que a unidade realmente tem.
 */

export type ScanReason = 'OK' | 'EMPTY' | 'NO_DIGITS' | 'NOT_ACTIVE';

export interface ScanResult {
  /** número da comanda reconhecido (null quando não bateu com a sequência ativa) */
  number: number | null;
  /** o que o leitor mandou, já limpo */
  raw: string;
  /** melhor palpite numérico, mesmo quando não está na sequência (p/ mostrar na tela) */
  guess: number | null;
  reason: ScanReason;
}

/** Comprimentos de sufixo/prefixo testados quando o código traz dígitos extras. */
const WINDOWS = [3, 4, 5, 6, 7, 8];

/** Candidatos a "número da comanda" contidos num código lido, em ordem de aposta. */
export function candidateNumbers(raw: string): number[] {
  const digits = (raw.match(/\d+/g) ?? []).join('');
  if (!digits) return [];

  const out: number[] = [];
  const push = (s: string) => {
    if (!s || s.length > 15) return;
    const n = Number(s);
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  };

  push(digits); // número puro (cobre também zeros à esquerda, via Number())

  // EAN-13/UPC: o último dígito é verificador
  if (digits.length === 13 || digits.length === 12) push(digits.slice(0, -1));

  // número embutido num código maior: tenta pelo fim (mais comum) e pelo começo
  for (const w of WINDOWS) if (digits.length > w) push(digits.slice(-w));
  for (const w of WINDOWS) if (digits.length > w) push(digits.slice(0, w));

  return out;
}

/**
 * Interpreta uma bipagem contra a sequência ativa da unidade.
 * `active` vem de getActiveSequence(unitId).active.
 */
export function parseCommandBarcode(rawInput: string, active: Set<number>): ScanResult {
  const raw = String(rawInput ?? '').trim();
  if (!raw) return { number: null, raw, guess: null, reason: 'EMPTY' };

  const candidates = candidateNumbers(raw);
  if (candidates.length === 0) return { number: null, raw, guess: null, reason: 'NO_DIGITS' };

  const hit = candidates.find((n) => active.has(n));
  if (hit !== undefined) return { number: hit, raw, guess: hit, reason: 'OK' };

  return { number: null, raw, guess: candidates[0], reason: 'NOT_ACTIVE' };
}

/** Faltantes = ativas − bipadas. Ordenado, pronto p/ virar divergência. */
export function absentFromScans(active: Set<number>, scanned: Set<number>): number[] {
  const out: number[] = [];
  for (const n of active) if (!scanned.has(n)) out.push(n);
  return out.sort((a, b) => a - b);
}
