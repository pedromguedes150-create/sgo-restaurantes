/**
 * ESCOPO ATIVO do portão do design system.
 *
 * >>> Este array CRESCE a cada onda. <<<
 * Fora do escopo, as regras de hex/rgb e de espaçamento ficam DESLIGADAS
 * (nem warning) — o output fica limpo enquanto o legado não foi migrado.
 * Ao final de cada onda, o 1º commit da onda seguinte é:
 *   `lint: ampliar escopo do stylelint para <telas da onda>`
 * Na Onda 5 o escopo passa a ser 'src/**' e este arquivo some.
 *
 * Onda atual: 0 (fundação).
 */

// Camada 1 — stylelint (arquivos .css). Onde o hex/rgb são proibidos.
const CSS_SCOPE = [
  'src/styles/sgo-design-system.css',
  'src/components/ui/**/*.css',
  'src/app/dev/ui/**/*.css',
];

// Camada 2 — guard de tokens em .ts/.tsx (hex literal e espaçamento arbitrário
// fora da grade 8pt em classes/estilos, que o stylelint não enxerga em JSX).
const TSX_SCOPE_DIRS = ['src/components/ui', 'src/app/dev/ui'];

// Única fonte de verdade dos tokens: o ÚNICO arquivo onde hex/rgb são permitidos.
const TOKENS_FILE = 'src/styles/sgo-design-system.css';

module.exports = { CSS_SCOPE, TSX_SCOPE_DIRS, TOKENS_FILE };
