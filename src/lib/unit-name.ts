/**
 * Nome curto da unidade (REDESIGN.md regra 5): "Moreira", nunca
 * "COMERCIAL LINS & GUEDES LTDA ( MOREIRA)". A razão social completa só no cadastro.
 *
 *  - Se houver parênteses, usa o conteúdo deles.
 *  - Senão, remove a razão social comum da rede e usa o que sobra.
 *  - Title case PT-BR: preposições minúsculas (de/do/da…), siglas e códigos
 *    (ME, KM13) mantêm caixa alta.
 */
const SMALL = new Set(['de', 'do', 'da', 'dos', 'das', 'e']);

function titleCasePtBr(s: string): string {
  const toks = s.trim().split(/\s+/).filter(Boolean);
  return toks
    .map((t, i) => {
      const lower = t.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      if (/\d/.test(t) || t.length <= 2) return t.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function shortUnitName(name: string | null | undefined): string {
  if (!name) return '';
  const paren = name.match(/\(([^)]+)\)/);
  let s: string;
  if (paren) {
    s = paren[1];
  } else {
    s = name.replace(/COMERCIAL\s+LINS\s*[&E]\s*GUEDES\s+LTDA/i, '').trim();
    if (!s) s = name;
  }
  return titleCasePtBr(s);
}
