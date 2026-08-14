/**
 * ESCOPO do portão do design system.
 *
 * Onda 5: o guard de TSX cobre **src/** inteiro** — tudo que nascer daqui em
 * diante já entra protegido. A dívida restante virou uma lista EXPLÍCITA
 * (TSX_EXCEPTIONS) em vez de um escopo estreito: é mais honesto, porque o que
 * falta fica visível e some arquivo a arquivo.
 *
 * O stylelint (CSS) continua restrito: `globals.css` é a ponte com o shadcn
 * legado (usa hsl(var(--...)) de propósito) e sai quando o legado sair.
 */

// Camada 1 — stylelint (.css): onde hex e rgb/hsl crus são proibidos.
const CSS_SCOPE = [
  'src/styles/sgo-design-system.css',
  'src/components/ui/**/*.css',
  'src/app/dev/**/*.css',
];

// Camada 2 — guard de tokens em .ts/.tsx: agora o src inteiro.
const TSX_SCOPE_DIRS = ['src'];

/**
 * Exceções do guard de TSX. Cada linha precisa de um porquê — e a meta é
 * esvaziar esta lista.
 *  - app/layout.tsx: `themeColor` do PWA é metadata do navegador e exige uma
 *    cor literal; var(--sgo-*) não é resolvido no manifest.
 */
const TSX_EXCEPTIONS = ['src/app/layout.tsx'];

// Única fonte de verdade dos tokens: o ÚNICO arquivo onde hex/rgb são permitidos.
const TOKENS_FILE = 'src/styles/sgo-design-system.css';

module.exports = { CSS_SCOPE, TSX_SCOPE_DIRS, TSX_EXCEPTIONS, TOKENS_FILE };
