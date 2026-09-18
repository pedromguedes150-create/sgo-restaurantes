import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * RELATÓRIO IMPRESSO NÃO PODE SAIR EM BRANCO.
 *
 * O defeito que este teste existe para impedir (estava em produção, achado com
 * o usuário gerando um PDF do relatório de gás): as animações de entrada usam
 * `animation-fill-mode: both`, e o primeiro quadro delas é invisível —
 * `sgo-page-emerge` começa em `opacity: 0` e `sgo-page-push` começa deslocado
 * 100% para fora da página.
 *
 * Na tela isso é o comportamento certo (o elemento já assume o quadro inicial
 * antes de a animação começar, e nada pisca). Na impressão, porém, o Chrome
 * monta um documento novo, as animações voltam ao tempo zero e o papel não roda
 * quadro nenhum: o `both` congela tudo no quadro inicial. Como
 * `.sgo-page-enter` envolve TODA tela do grupo (app) — veja
 * `src/app/(app)/template.tsx` —, o sistema inteiro imprimia em branco, em
 * qualquer tema e em qualquer relatório.
 *
 * Medido no PDF gerado pelo próprio Chrome: 73 páginas e ZERO operadores de
 * desenho de texto. Não era texto branco sobre branco — não havia texto. A
 * contagem de páginas saía certa porque `opacity` e `transform` não alteram o
 * layout, o que torna o defeito invisível para `tsc`, lint e para qualquer
 * teste de render: nenhum deles abre um PDF.
 *
 * A verificação é sobre o TEXTO do CSS de propósito — em jsdom não há mídia de
 * impressão nem motor de animação. O que se trava aqui é o contrato: se existe
 * animação com quadro inicial invisível, a impressão tem de desligar animação.
 */

const css = readFileSync('src/styles/sgo-design-system.css', 'utf8');

/** Extrai o corpo de um bloco `@algo ... { ... }` com chaves balanceadas. */
function bloco(fonte: string, inicio: number): string {
  const abre = fonte.indexOf('{', inicio);
  let profundidade = 0;
  for (let i = abre; i < fonte.length; i++) {
    if (fonte[i] === '{') profundidade++;
    else if (fonte[i] === '}' && --profundidade === 0) return fonte.slice(abre + 1, i);
  }
  throw new Error('bloco sem fechamento a partir de ' + inicio);
}

/** Todos os `@media print { ... }` do arquivo, concatenados. */
function midiaDeImpressao(): string {
  const partes: string[] = [];
  const re = /@media\s+print\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) partes.push(bloco(css, m.index));
  return partes.join('\n');
}

/** Keyframes cujo primeiro quadro deixa o elemento invisível ou fora da página. */
function animacoesQueComecamInvisiveis(): string[] {
  const achadas: string[] = [];
  const re = /@keyframes\s+([\w-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const corpo = bloco(css, m.index);
    const from = corpo.match(/(?:^|\})\s*(?:from|0%)\s*\{([^}]*)\}/);
    if (!from) continue;
    const primeiroQuadro = from[1];
    const invisivel = /opacity:\s*0(\.\d+)?\s*;/.test(primeiroQuadro);
    const foraDaPagina = /translate3d\(\s*100%|translateX\(\s*100%|translateY\(\s*100%/.test(primeiroQuadro);
    if (invisivel || foraDaPagina) achadas.push(m[1]);
  }
  return achadas;
}

describe('impressão não congela o conteúdo no primeiro quadro da animação', () => {
  it('existe animação com quadro inicial invisível — senão este teste perdeu o sentido', () => {
    /* Se um dia nenhuma animação começar invisível, o risco acabou e a regra de
       impressão vira decoração. Falhar aqui é um convite a reler, não um bug. */
    expect(animacoesQueComecamInvisiveis()).toContain('sgo-page-emerge');
  });

  it('a mídia de impressão desliga animação e transição para todo elemento', () => {
    const print = midiaDeImpressao();
    expect(print).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{[^}]*animation:\s*none\s*!important/);
    expect(print).toMatch(/transition:\s*none\s*!important/);
  });

  it('o seletor é universal, e não uma lista de classes que envelhece', () => {
    /* Listar `.sgo-page-enter, .sgo-stagger > *, ...` funcionaria hoje e
       deixaria a armadilha armada para a próxima animação de entrada — que
       nasceria imprimindo em branco, do mesmo jeito. */
    const print = midiaDeImpressao();
    const regra = print.match(/([^{}]+)\{[^}]*animation:\s*none\s*!important[^}]*\}/);
    expect(regra).not.toBeNull();
    expect(regra![1]).not.toMatch(/\.sgo-/);
  });

  it('toda tela do grupo (app) passa pelo elemento animado — é por isso que valia para o sistema todo', () => {
    const template = readFileSync('src/app/(app)/template.tsx', 'utf8');
    expect(template).toMatch(/sgo-page-enter/);
  });
});
