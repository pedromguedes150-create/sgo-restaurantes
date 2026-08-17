const { CSS_SCOPE, TOKENS_FILE } = require('./scripts/ds-scope.cjs');

/**
 * Stylelint do design system (Onda 0+). Duas camadas:
 *  - rules {} no topo  → fora do escopo ativo, NADA é checado (output limpo).
 *  - overrides         → dentro do CSS_SCOPE, proíbe hex e funções de cor
 *                        cruas (rgb/rgba/hsl/hsla); tudo deve vir de var(--sgo-*).
 *  - TOKENS_FILE       → exceção: é a fonte de verdade, hex/rgb liberados.
 * O escopo cresce por onda (ver scripts/ds-scope.cjs).
 */
module.exports = {
  rules: {},
  overrides: [
    {
      files: CSS_SCOPE,
      rules: {
        'color-no-hex': true,
        'color-named': 'never',
        'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla'],
      },
    },
    {
      // Fonte de verdade dos tokens — hex e rgb permitidos só aqui.
      files: [TOKENS_FILE],
      rules: {
        'color-no-hex': null,
        'function-disallowed-list': null,
      },
    },
  ],
};
