/**
 * Tema do SGO (design system, Onda 0+). Persistido em COOKIE (não localStorage)
 * para o servidor poder marcar `data-theme` no <html> antes do 1º paint → sem flash.
 * O atributo é sempre escrito; o CSS decide a partir dele:
 *  - 'light' | 'dark' → fixo
 *  - 'system'         → segue prefers-color-scheme
 * Sem cookie, o app assume 'system' (desde a Onda 7, quando o conteúdo passou
 * a usar só tokens e o tema escuro virou seguro).
 * Fonte de verdade dos valores: src/styles/sgo-design-system.css.
 */
export const THEME_COOKIE = 'sgo-theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 ano

export type ThemeChoice = 'light' | 'dark' | 'system';

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === 'light' || v === 'dark' || v === 'system';
}
