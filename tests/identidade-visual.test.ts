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

  const kit = readFileSync('src/styles/sgo-kit.css', 'utf8');

  it('o item ATIVO do menu superior usa a marca (via tokens do kit, que apontam para o bordô)', () => {
    /* Desde o kit de layout (v1.143.0) o ativo é `.sgo-navitem.on`, e a tinta
       dele vem de --sgo-nav-item-active-bg e --sgo-blue-600 — que, no CSS
       GERADO, são o bordô. É isso que se trava aqui, dos dois lados. */
    expect(nav).toMatch(/'sgo-navitem', \(ativa \|\| open\) && 'on'/);
    expect(kit).toMatch(/--sgo-nav-item-active-bg:\s*rgb\(var\(--sgo-brand-rgb\)/);
    expect(kit).toMatch(/--sgo-blue-600:\s*var\(--sgo-brand\)/);
    expect(kit).toMatch(/--sgo-accent:\s*var\(--sgo-brand\)/);
  });

  it('o menu superior não introduz azul', () => {
    expect(nav).not.toMatch(/\b(bg|text|border|ring)-info\b/);
  });

  it('o CSS do kit não carrega NENHUM azul de marca do SGO dos Postos', () => {
    /* Se um deles voltar — por regerar o CSS com o script errado, por exemplo —
       o Restaurante vira azul em silêncio. */
    for (const azul of ['#0A4DA8', '#1159BD', '#003068', '#2E7CD6', '#1B5FA8', '#144B86', '#5B9BF0', '#7FB3F5', '#3D7FE0', '#2B66C6', '#0B3B8C', '#93C5FD', '#0F4C81', '#08306F']) {
      expect(kit.toUpperCase(), `azul ${azul} no sgo-kit.css`).not.toContain(azul);
    }
    expect(kit).not.toMatch(/rgba\(10,\s*77,\s*168/);
    expect(kit).not.toMatch(/rgba\(46,\s*124,\s*214/);
  });

  it('a cápsula do cartão do Dashboard tem a MARCA como padrão', () => {
    /* Vermelho e âmbar ficam para crítico e atenção; o resto é bordô. Uma
       cápsula cinza por padrão devolveria o painel ao visual de planilha.
       Desde a Fase 4 do kit o cartão é o SgoKpi: o tom padrão é `blue`, o nome
       do kit para o tom de AÇÃO — que no Restaurante é o bordô, porque o CSS do
       kit resolve a cápsula `--blue` em `--sgo-accent` e o accent é a marca
       (conferido no caso acima). Se alguém trocar o tom padrão por `gray` ou
       `sky`, ou remapear a cápsula, o painel perde a marca em silêncio. */
    expect(central).toMatch(/ok:\s*'blue'/);
    expect(kit).toMatch(/\.sgo-kpi__ic--blue[^{]*\{background:var\(--sgo-accent-soft\);color:var\(--sgo-accent\)\}/);
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
