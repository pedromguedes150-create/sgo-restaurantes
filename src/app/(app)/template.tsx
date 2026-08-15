'use client';

/**
 * Transição de navegação (Onda 8).
 *
 * `template.tsx` re-monta a cada navegação (diferente de `layout.tsx`, que
 * persiste), então a animação de ENTRADA toca a cada troca de rota.
 *
 * MOBILE: empurrão da direita, como o iOS. É o gesto que dá sentido de
 * hierarquia — a tela nova vem "de dentro" da que você tocou.
 * DESKTOP: um empurrão de página inteira ao lado de uma sidebar parada fica
 * estranho, porque só metade da tela se move. Lá a entrada é o que o iPadOS/
 * macOS fazem: aparecer com um crescimento mínimo. Por isso a divisão por
 * media query, e não uma animação só.
 *
 * O invólucro externo recorta no eixo X para o empurrão não gerar barra de
 * rolagem horizontal. `clip` (e não `hidden`) porque `hidden` forçaria o eixo Y
 * a virar contêiner de rolagem e quebraria o `position: sticky` do cabeçalho.
 *
 * Quem anima é o filho: um ancestral com `transform` quebraria `position: fixed`
 * de qualquer descendente, e é justamente o que o invólucro NÃO faz.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="sgo-page-clip">
      <div className="sgo-page-enter">{children}</div>
    </div>
  );
}
