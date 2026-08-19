/**
 * Leitura do código de barras da comanda.
 *
 * O leitor do caixa funciona como TECLADO: ao bipar, ele "digita" o código e dá
 * Enter. A câmera do celular entrega a mesma string.
 *
 * PADRÃO DA REDE — medido em 19/08/2026 com o diagnóstico do leitor, num cartão
 * real da Beija-flor: formato CODE_128, conteúdo "0346" — o número da comanda
 * com zero à esquerda, em 4 dígitos. Sem prefixo de unidade, sem dígito
 * verificador. (O cartão traz também um QR do Instagram, que NÃO é comanda.)
 *
 * Por isso o parser é EXATO para etiquetas curtas: até 6 dígitos, a única
 * leitura aceita é o número inteiro. Antes ele testava janelas de dígitos e
 * "0346" produzia os palpites [346, 34] — e 34 TAMBÉM é uma comanda válida. Se a
 * 346 não estivesse ativa, a conferência marcava a 34 como presente: uma comanda
 * que não estava na mesa. Esse risco morreu aqui.
 *
 * A tolerância por janelas continua, mas só para códigos LONGOS (mais de 8
 * dígitos), que é onde ela ganha sentido — outra gráfica, outro padrão, número
 * embutido num código maior. Aí ainda vale a rede de segurança: um palpite só é
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

/**
 * Até aqui, o código é lido como o número inteiro e nada mais. É o tamanho da
 * etiqueta da rede (4 dígitos) com folga, e é o que impede "0346" de virar 34.
 */
const EXATO_ATE = 6;

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

  // Etiqueta curta (o padrão da rede): só o número inteiro. Sem janelas, sem
  // chance de casar com outra comanda válida por coincidência de sufixo.
  if (digits.length <= EXATO_ATE) return out;

  // EAN-13/UPC: o último dígito é verificador
  if (digits.length === 13 || digits.length === 12) push(digits.slice(0, -1));

  // Código longo de padrão desconhecido: número embutido: tenta pelo fim
  // (mais comum) e pelo começo.
  if (digits.length > 8) {
    for (const w of WINDOWS) if (digits.length > w) push(digits.slice(-w));
    for (const w of WINDOWS) if (digits.length > w) push(digits.slice(0, w));
  }

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

  /* 1) LEITURA EXATA primeiro: o código inteiro como número. É o padrão da rede
        ("0346" → 346) e também resolve etiqueta com muitos zeros à esquerda. Tem
        precedência absoluta — não é um palpite entre iguais. */
  const exato = candidates[0];
  if (active.has(exato)) return { number: exato, raw, guess: exato, reason: 'OK' };

  /* 2) Só então as janelas, e apenas se apontarem para UMA comanda ativa. Num
        código longo elas casam por coincidência de sufixo — num EAN de 13 dígitos
        chegavam a 1, 5 e 13 ao mesmo tempo. Com ambiguidade, recusar e mostrar o
        código lido é honesto; escolher a primeira marcaria presente uma comanda
        que não está na mesa. */
  const ativos = candidates.slice(1).filter((n) => active.has(n));
  if (ativos.length === 1) return { number: ativos[0], raw, guess: ativos[0], reason: 'OK' };

  return { number: null, raw, guess: exato, reason: 'NOT_ACTIVE' };
}

/** Faltantes = ativas − bipadas. Ordenado, pronto p/ virar divergência. */
export function absentFromScans(active: Set<number>, scanned: Set<number>): number[] {
  const out: number[] = [];
  for (const n of active) if (!scanned.has(n)) out.push(n);
  return out.sort((a, b) => a - b);
}
