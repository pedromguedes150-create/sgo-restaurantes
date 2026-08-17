/**
 * ESCOPO do portão do design system.
 *
 * Onda 6 (fase E): acabaram os escopos parciais. As duas camadas cobrem
 * **src/** inteiro** e não há mais lista de arquivos isentos — o que precisar
 * de exceção justifica na própria linha (ver ALLOW_MARK).
 */

// Camada 1 — stylelint (.css): onde hex e rgb/hsl crus são proibidos.
const CSS_SCOPE = ['src/**/*.css'];

// Camada 2 — guard de tokens em .ts/.tsx.
const TSX_SCOPE_DIRS = ['src'];

/**
 * Marca de dispensa POR LINHA do guard de hex. Substituiu a lista de arquivos
 * isentos: isentar o arquivo inteiro escondia o resto dele do portão. O motivo
 * é obrigatório — `ds-allow-hex` sozinho não vale.
 *
 * Hoje o único uso legítimo é `themeColor` em app/layout.tsx: é metadata do
 * navegador (barra do sistema no PWA), lida antes de qualquer CSS, então
 * var(--sgo-*) não é resolvido ali.
 */
const ALLOW_MARK = 'ds-allow-hex';

// Única fonte de verdade dos tokens: o ÚNICO arquivo onde hex/rgb são permitidos.
const TOKENS_FILE = 'src/styles/sgo-design-system.css';

module.exports = { CSS_SCOPE, TSX_SCOPE_DIRS, ALLOW_MARK, TOKENS_FILE };
