/**
 * Tons semânticos do kit de layout (sgo-kit.css, seções 8 e 10).
 *
 * Existe para os componentes tiparem o tom em vez de receber uma classe
 * pronta por prop — foi assim que, no SGO dos Postos, o Dashboard acumulou
 * seis cores fora da paleta. Com um union fechado, o compilador recusa o que
 * não for do design system.
 *
 * `blue` é o nome do kit para o tom de AÇÃO; no Restaurante ele aponta para
 * `--sgo-accent` = bordô (ver scripts/build-kit-css.cjs). O nome foi mantido
 * para o código das telas-exemplo valer sem tradução.
 * `brand` é o degradê de plumagem — só existe para cápsula de ícone.
 */
export type SgoTone = 'gray' | 'blue' | 'sky' | 'green' | 'amber' | 'red' | 'violet';

/** Tons aceitos por cápsula de ícone, que inclui o degradê da marca. */
export type SgoIconTone = SgoTone | 'brand';

/** Cor de texto/gráfico correspondente a cada tom. */
export const TONE_INK: Record<SgoTone, string> = {
  gray: 'var(--sgo-ink-2)',
  blue: 'var(--sgo-accent)',
  sky: 'var(--sgo-sky)',
  green: 'var(--sgo-ok)',
  amber: 'var(--sgo-warn)',
  red: 'var(--sgo-bad)',
  violet: 'var(--sgo-violet)',
};

/** Semáforo do Restaurante (verde/âmbar/vermelho) → tom do kit. */
export function toneFromStatus(status: 'VERDE' | 'AMARELO' | 'VERMELHO' | string | null | undefined): SgoTone {
  if (status === 'VERDE') return 'green';
  if (status === 'AMARELO') return 'amber';
  if (status === 'VERMELHO') return 'red';
  return 'gray';
}
