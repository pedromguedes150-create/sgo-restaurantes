import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * EM TODA LARGURA TEM DE HAVER NAVEGAÇÃO.
 *
 * O defeito que este teste existe para impedir (v1.98.0, em produção):
 * a barra superior nasceu `hidden lg:block` (≥1024px) e a barra de baixo é
 * `md:hidden` (<768px). Entre 768 e 1023px — todo tablet em retrato — o SGO
 * ficou **sem menu nenhum**: nem em cima, nem embaixo. A sidebar que saiu era
 * `md:block` e cobria exatamente essa faixa; ninguém percebeu porque `tsc`,
 * lint e testes passam igual, e no desktop do desenvolvedor a tela está sempre
 * acima de 1024px.
 *
 * A verificação é sobre o TEXTO das classes de propósito: o Tailwind não
 * resolve em jsdom, e um teste de render não veria media query nenhuma. O que
 * importa aqui é o contrato dos dois componentes — que eles se encontrem no
 * mesmo ponto, sem vão.
 */

const ler = (p: string) => readFileSync(p, 'utf8');

/** O breakpoint em que o elemento PASSA a aparecer (`hidden md:block` → md). */
function apareceEm(classes: string): string | null {
  if (!/\bhidden\b/.test(classes)) return null;
  const m = classes.match(/\b(sm|md|lg|xl|2xl):(block|flex|inline|grid)\b/);
  return m ? m[1] : null;
}

/** O breakpoint em que o elemento SOME (`md:hidden` → md). */
function someEm(classes: string): string | null {
  const m = classes.match(/\b(sm|md|lg|xl|2xl):hidden\b/);
  return m ? m[1] : null;
}

describe('a navegação não deixa faixa de largura descoberta', () => {
  it('a barra superior aparece exatamente onde a barra de baixo some', () => {
    const topo = ler('src/components/layout/top-nav.tsx');
    const baixo = ler('src/components/layout/bottom-nav.tsx');

    const raizDoTopo = topo.match(/<div ref=\{ref\} className="([^"]+)"/)?.[1] ?? '';
    const raizDeBaixo = baixo.match(/<nav className="([^"]+)"/)?.[1] ?? '';

    expect(raizDoTopo, 'não achei a raiz da barra superior').not.toBe('');
    expect(raizDeBaixo, 'não achei a raiz da barra de baixo').not.toBe('');

    const entra = apareceEm(raizDoTopo);
    const sai = someEm(raizDeBaixo);

    expect(entra, 'a barra superior precisa nascer escondida e aparecer num breakpoint').not.toBeNull();
    expect(sai, 'a barra de baixo precisa sumir num breakpoint').not.toBeNull();

    /* Se a de baixo some em `md` e a de cima só entra em `lg`, existe uma faixa
       inteira de larguras sem menu — foi exatamente o que aconteceu. */
    expect(entra, `barra de baixo some em ${sai} e a de cima só entra em ${entra}: sobra uma faixa sem navegação`).toBe(sai);
  });

  it('a busca do cabeçalho também se cobre: campo e lupa trocam no mesmo ponto', () => {
    const header = ler('src/components/layout/app-header.tsx');
    const campo = header.match(/<GlobalSearch areas=\{areas\} className="([^"]+)"/)?.[1] ?? '';
    const lupa = header.match(/aria-label="Buscar"\s*\n\s*className=\{`\$\{iconBtn\} ([^`]+)`\}/)?.[1] ?? '';

    expect(campo, 'não achei o campo de busca do cabeçalho').not.toBe('');
    expect(lupa, 'não achei o botão de lupa do cabeçalho').not.toBe('');
    expect(apareceEm(campo)).toBe(someEm(lupa));
  });
});

describe('a tira de áreas cabe no tablet', () => {
  it('ícone e seta das áreas só entram a partir de `lg`', () => {
    /* A 768px as sete áreas ocupam quase toda a largura. Com ícone (16px) e
       seta (14px) em cada uma, a sétima — Administrativo — caía para fora e
       virava rolagem lateral: uma área inteira escondida. */
    const topo = ler('src/components/layout/top-nav.tsx');
    const icones = topo.match(/<Icone className=\{cn\('([^']+)'/g) ?? [];
    expect(icones.length, 'esperava o ícone nos dois tipos de área (link e botão)').toBe(2);
    for (const i of icones) expect(i).toContain('lg:inline');

    const seta = topo.match(/<ChevronDown className=\{cn\('([^']+)'/)?.[1] ?? '';
    expect(seta).toContain('lg:inline');
  });

  it('a tira rola nela mesma, nunca a página', () => {
    /* Rede de segurança: se um dia entrar uma oitava área, quem rola é a tira.
       A página rolando de lado é o que o design system proíbe. */
    const topo = ler('src/components/layout/top-nav.tsx');
    expect(topo).toMatch(/<ul className="[^"]*overflow-x-auto/);
  });
});
