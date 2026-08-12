/**
 * Tema do SGO (design system, Onda 0+). Persistido em COOKIE (não localStorage)
 * para o servidor poder marcar `data-theme` no <html> antes do 1º paint → sem flash.
 *  - 'light' | 'dark' → escolha explícita, vence o sistema (atributo data-theme)
 *  - 'system'         → sem atributo; o CSS decide via prefers-color-scheme
 * Fonte de verdade dos valores: src/styles/sgo-design-system.css.
 */
export const THEME_COOKIE = 'sgo-theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 ano

export type ThemeChoice = 'light' | 'dark' | 'system';

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === 'light' || v === 'dark' || v === 'system';
}
