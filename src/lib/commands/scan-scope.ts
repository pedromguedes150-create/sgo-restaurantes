/**
 * O escopo de uma conferência por leitor — decidido pelo que foi bipado.
 *
 * A regra, pedida pela operação: **bipar uma comanda fora da faixa do dia
 * significa que a conferência é completa.** No meio da semana o caixa confere
 * só 1–300; quando ele começa a bipar a 350, é porque está fazendo a contagem
 * da semana — e o sistema tem de acompanhar, em vez de recusar o número.
 *
 * Sem isso, o leitor respondia "não pertence à sequência" para tudo acima da
 * faixa, e a contagem completa simplesmente não podia ser feita por leitor.
 */

export interface EscopoDoLeitor {
  /** Números que ESTA conferência julga. */
  escopo: Set<number>;
  /** É a contagem completa da semana? */
  completa: boolean;
  /** As bipadas que estavam fora da faixa do dia — o que disparou a mudança. */
  foraDaFaixa: number[];
}

export function escopoDoLeitor(
  ativas: Set<number>,
  faixaDoDia: Set<number>,
  temFaixa: boolean,
  bipadas: Iterable<number>,
): EscopoDoLeitor {
  /* Sem faixa configurada a unidade sempre confere tudo — não há o que
     decidir, e chamar isso de "completa" é a verdade. */
  if (!temFaixa) return { escopo: ativas, completa: true, foraDaFaixa: [] };

  const foraDaFaixa = [...bipadas].filter((n) => ativas.has(n) && !faixaDoDia.has(n)).sort((a, b) => a - b);
  if (foraDaFaixa.length === 0) return { escopo: faixaDoDia, completa: false, foraDaFaixa: [] };
  return { escopo: ativas, completa: true, foraDaFaixa };
}
