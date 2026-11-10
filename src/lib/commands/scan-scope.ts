/**
 * O escopo de uma conferência por leitor — decidido pelo que foi bipado.
 *
 * REGRA (v1.200.0, muda a da v1.1xx): **bipar uma comanda fora da faixa do dia
 * NÃO transforma a conferência em completa.** Antes, uma única leitura de fora
 * (um erro de leitura, uma comanda guardada no lugar errado) bastava para
 * mudar o escopo e passar a julgar 700 comandas — decisão grande demais para um
 * efeito colateral de uma bipada. Agora a comanda fora da programação é
 * IDENTIFICADA e fica de fora da conta (nunca vira faltante nem presente); para
 * conferir tudo, inicia-se uma conferência COMPLETA, ou — numa sessão em
 * andamento — um Supervisor/Coordenador/Admin autoriza a mudança de escopo com
 * motivo (`ampliarEscopo` em sessao.ts).
 */

export interface EscopoDoLeitor {
  /** Números que ESTA conferência julga. */
  escopo: Set<number>;
  /** É a contagem completa? Só quando a unidade não tem faixa do dia (confere tudo sempre). */
  completa: boolean;
  /** As bipadas fora da faixa do dia: identificadas, avisadas, e NUNCA julgadas. */
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
  return { escopo: faixaDoDia, completa: false, foraDaFaixa };
}
