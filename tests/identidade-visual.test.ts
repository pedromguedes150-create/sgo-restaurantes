import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * A IDENTIDADE É VINHO/BORDÔ.
 *
 * Este arquivo existe por causa de um pedido explícito: modernizar o
 * acabamento usando o SGO dos postos como referência de ACABAMENTO, e não de
 * paleta — "não substituir a identidade vinho/bordô por azul".
 *
 * O risco é real e silencioso. A próxima pessoa que for "modernizar" uma tela
 * copiando um padrão de mercado traz azul junto, porque quase todo painel de
 * referência é azul; e como `info` (azul) É um token válido do sistema, nada
 * quebraria — nem o lint, nem o guard de paleta, que só confere se a chave
 * existe. O que se protege aqui é qual chave carrega a MARCA.
 */

const css = readFileSync('src/styles/sgo-design-system.css', 'utf8');

/** Lê "--token-rgb: r g b" do bloco claro (a primeira ocorrência). */
function canais(token: string): { r: number; g: number; b: number } {
  const m = new RegExp(`--sgo-${token}-rgb:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`).exec(css);
  if (!m) throw new Error(`token --sgo-${token}-rgb não encontrado`);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

describe('A cor da marca', () => {
  it('é o bordô da rede, e não outra coisa', () => {
    expect(canais('brand')).toEqual({ r: 124, g: 26, b: 43 });
  });

  it('é VERMELHA, não azul — o vermelho domina os outros canais', () => {
    const { r, g, b } = canais('brand');
    expect(r).toBeGreaterThan(b * 2);
    expect(r).toBeGreaterThan(g * 2);
  });

  it('as tintas da marca puxam para o vinho, inclusive as claras', () => {
    /* As tintas são o fundo do item ativo do menu, do crachá e do chip do
       cartão. Uma tinta azulada entregaria a identidade pelo fundo, mesmo com
       o bordô intacto no texto. */
    for (const tinta of ['brand-tint', 'brand-tint-2', 'brand-hover', 'brand-active']) {
      const { r, b } = canais(tinta);
      expect(r, tinta).toBeGreaterThan(b);
    }
  });
});

describe('Onde a marca aparece', () => {
  const nav = readFileSync('src/components/layout/top-nav.tsx', 'utf8');
  const central = readFileSync('src/components/dashboard/central-da-rede.tsx', 'utf8');

  it('o item ATIVO do menu superior usa a marca', () => {
    expect(nav).toMatch(/estaAtiva[\s\S]{0,120}bg-brand-tint-2[\s\S]{0,60}text-brand/);
  });

  it('o menu superior não introduz azul', () => {
    expect(nav).not.toMatch(/\b(bg|text|border|ring)-info\b/);
  });

  it('o chip do cartão do Dashboard tem a MARCA como padrão', () => {
    /* Vermelho e âmbar ficam para crítico e atenção; o resto é bordô. Um chip
       cinza por padrão devolveria o painel ao visual de planilha. */
    expect(central).toMatch(/ok:\s*'bg-brand-tint-2 text-brand'/);
  });

  it('o Dashboard não introduz azul', () => {
    expect(central).not.toMatch(/\b(bg|text|border|ring)-info\b/);
  });
});

describe('O acabamento vem de TOKEN, não de sombra solta', () => {
  it('as três elevações existem e são declaradas no design system', () => {
    for (const t of ['--sgo-shadow-card', '--sgo-shadow-card-hover', '--sgo-shadow-pop']) {
      expect(css, t).toContain(`${t}:`);
    }
  });

  it('a impressão zera as sombras — no papel elas viram borrão cinza', () => {
    const print = css.slice(css.indexOf('@media print'));
    expect(print).toContain('--sgo-shadow-card: none');
    expect(print).toContain('--sgo-shadow-pop: none');
  });
});
