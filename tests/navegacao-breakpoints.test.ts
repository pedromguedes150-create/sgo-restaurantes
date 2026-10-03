import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * EM TODA LARGURA TEM DE HAVER NAVEGAÇÃO.
 *
 * O defeito que este teste existe para impedir (v1.98.0, em produção): a barra
 * superior nascia em `lg` e a barra de baixo sumia em `md` — entre 768 e
 * 1023px, todo tablet em retrato, o SGO ficou **sem menu nenhum**.
 *
 * Com o kit de layout (v1.143.0) a cobertura é feita por TRÊS peças, como no
 * SGO dos Postos: a barra de módulos entra em `lg`; abaixo disso o hambúrguer
 * (menu móvel) está visível; no celular a barra de baixo soma. A verificação
 * continua sobre o TEXTO das classes de propósito — o Tailwind não resolve em
 * jsdom, e um teste de render não veria media query nenhuma.
 */
const ler = (p: string) => readFileSync(p, 'utf8');

/** O breakpoint em que o elemento PASSA a aparecer (`hidden lg:flex` → lg). */
function apareceEm(classes: string): string | null {
  if (!/\bhidden\b/.test(classes)) return null;
  const m = classes.match(/\b(sm|md|lg|xl|2xl):(block|flex|inline|grid|inline-flex)\b/);
  return m ? m[1] : null;
}

/** O breakpoint em que o elemento SOME (`lg:hidden` → lg). */
function someEm(classes: string): string | null {
  const m = classes.match(/\b(sm|md|lg|xl|2xl):hidden\b/);
  return m ? m[1] : null;
}

describe('a navegação não deixa faixa de largura descoberta', () => {
  const topo = ler('src/components/layout/top-nav.tsx');
  const movel = ler('src/components/layout/mobile-nav.tsx');
  const baixo = ler('src/components/layout/bottom-nav.tsx');

  it('o hambúrguer some exatamente onde a barra de módulos entra', () => {
    const raizDoTopo = topo.match(/<nav className="([^"]+)"/)?.[1] ?? '';
    const hamburguer = movel.match(/<button type="button" className="([^"]+)" onClick=\{\(\) => setOpen\(true\)\}/)?.[1] ?? '';
    expect(raizDoTopo, 'não achei a raiz da barra de módulos').not.toBe('');
    expect(hamburguer, 'não achei o hambúrguer do menu móvel').not.toBe('');
    const entra = apareceEm(raizDoTopo);
    const sai = someEm(hamburguer);
    expect(entra, 'a barra de módulos precisa nascer escondida e aparecer num breakpoint').not.toBeNull();
    expect(sai, 'o hambúrguer precisa sumir num breakpoint').not.toBeNull();
    expect(entra, `hambúrguer some em ${sai} e a barra só entra em ${entra}: sobra uma faixa sem navegação`).toBe(sai);
  });

  it('a barra de baixo do celular some ANTES de o hambúrguer sumir (nunca depois)', () => {
    const raizDeBaixo = baixo.match(/<nav className="([^"]+)"/)?.[1] ?? '';
    const hamburguer = movel.match(/<button type="button" className="([^"]+)" onClick=\{\(\) => setOpen\(true\)\}/)?.[1] ?? '';
    const ordem = ['sm', 'md', 'lg', 'xl', '2xl'];
    const baixoSome = someEm(raizDeBaixo);
    const movelSome = someEm(hamburguer);
    expect(baixoSome).not.toBeNull();
    expect(ordem.indexOf(baixoSome!)).toBeLessThanOrEqual(ordem.indexOf(movelSome!));
  });

  it('a busca da barra entra em sm; no celular quem busca é a barra de baixo', () => {
    const busca = ler('src/components/layout/nav-search.tsx');
    const botao = busca.match(/className="sgo-navsearch ([^"]+)"/)?.[1] ?? '';
    expect(botao, 'não achei o botão de busca da barra').not.toBe('');
    expect(apareceEm(botao)).toBe('sm');
    expect(baixo).toContain('aria-label="Buscar"');
  });
});

describe('a página nunca rola de lado por causa da moldura', () => {
  it('o trilho de módulo e o cabeçalho quebram linha (CSS do kit), e o dock rola nele mesmo', () => {
    const css = ler('src/styles/sgo-kit.css');
    expect(css).toMatch(/\.sgo-trilho\{[^}]*flex-wrap:wrap/);
    expect(css).toMatch(/\.sgo-phdr__tabs\{[^}]*flex-wrap:wrap/);
    expect(css).toMatch(/\.workspace-dock-scroll\s*\{[^}]*overflow-x:\s*auto/);
  });
});
