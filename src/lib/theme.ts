/**
 * Tema do SGO (design system, Onda 0+). Persistido em COOKIE (não localStorage)
 * para o servidor poder marcar `data-theme` no <html> antes do 1º paint → sem flash.
 * O atributo é sempre escrito; o CSS decide a partir dele:
 *  - 'light' | 'dark' → fixo
 *  - 'system'         → segue prefers-color-scheme
 * Fonte de verdade dos valores: src/styles/sgo-design-system.css.
 */
export const THEME_COOKIE = 'sgo-theme';
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 ano

export type ThemeChoice = 'light' | 'dark' | 'system';

/**
 * Tema de quem nunca escolheu. **Claro**, como manda a regra 2 do CLAUDE.md.
 *
 * A Onda 7 tinha deixado isto em 'system' (seguir o aparelho), porque foi ali
 * que o conteúdo passou a usar só tokens e o escuro virou seguro. Só que o
 * seletor não estava montado em tela nenhuma do app — apenas em /dev/ui —
 * então quem tivesse o celular no modo escuro via o SGO escuro e não tinha
 * como voltar. O escuro passa a ser escolha explícita: quem quiser marca em
 * Meu Perfil → Aparência.
 *
 * Constante e não literal solto: o padrão era decidido dentro do layout, longe
 * de tudo que explica o tema.
 */
export const THEME_DEFAULT: ThemeChoice = 'light';

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === 'light' || v === 'dark' || v === 'system';
}
