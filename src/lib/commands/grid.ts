/**
 * Regras da conferência em grade que valem a pena testar sozinhas.
 *
 * Ficam fora do componente porque foram exatamente o ponto de um beco sem
 * saída em produção: a grade mostrava um conjunto de números e a validação
 * julgava outro.
 */

/**
 * O que ficou faltando na grade.
 *
 * O universo é o dos **conferíveis** — o que o gerente consegue tocar. Comandas
 * em apuração e baixadas estão na grade só para o número não sumir do meio da
 * sequência: são desabilitadas e se resolvem no bloco de Divergências. Julgá-las
 * aqui travava a tela: com tudo o que dava para marcar marcado, o contador de
 * faltantes zerava e o campo de observação sumia — mas a confirmação continuava
 * recusando por falta de uma observação que já não tinha onde ser escrita.
 *
 * "Em uso" (com cliente) conta como presente, como diz a legenda da tela.
 */
export function ausentesDaGrade(
  conferiveis: number[],
  conferidas: Set<number> | number[],
  emUso: Set<number> | number[],
): number[] {
  const pres = conferidas instanceof Set ? conferidas : new Set(conferidas);
  const uso = emUso instanceof Set ? emUso : new Set(emUso);
  return conferiveis.filter((n) => !pres.has(n) && !uso.has(n));
}
