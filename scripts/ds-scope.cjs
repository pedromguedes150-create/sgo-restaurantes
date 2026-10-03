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

// Fonte de verdade dos tokens: o arquivo onde hex/rgb são permitidos.
const TOKENS_FILE = 'src/styles/sgo-design-system.css';
/**
 * Segunda fonte (v1.143.0): o CSS do kit de layout do SGO dos Postos, GERADO
 * por scripts/build-kit-css.cjs. Ele é todo tokens + classes .sgo-* e carrega
 * os vidros em rgba — é um arquivo de tokens tanto quanto o primeiro, e por
 * isso entra na mesma exceção. Nenhum .tsx ganha isenção com isto.
 */
const TOKENS_FILES = [TOKENS_FILE, 'src/styles/sgo-kit.css'];

module.exports = { CSS_SCOPE, TSX_SCOPE_DIRS, ALLOW_MARK, TOKENS_FILE, TOKENS_FILES };
