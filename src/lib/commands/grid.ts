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

/**
 * O universo de uma conferência: a faixa do dia ou a sequência inteira.
 *
 * No meio da semana a unidade usa só parte das comandas (ex.: 1 a 300) e o
 * resto fica guardado. Julgar as guardadas na conferência diária fazia centenas
 * delas caírem como faltantes todo dia — divergências falsas e supervisor
 * alertado à toa. A faixa é a mesma que o caixa já usa no leitor ("Madrugada",
 * em Configurações → Comandas); aqui ela passa a valer também para a grade.
 */
export function escopoDaConferencia(
  activeNumbers: number[],
  nightlyNumbers: number[],
  modo: 'dia' | 'completa',
): { universo: number[]; temFaixaDoDia: boolean; naFaixaDoDia: boolean } {
  /* Faixa que cobre tudo não é faixa: oferecer a escolha só confundiria, e o
     rótulo diria "faixa do dia (648)" ao lado de "completa (648)". */
  const temFaixaDoDia = nightlyNumbers.length > 0 && nightlyNumbers.length < activeNumbers.length;
  const naFaixaDoDia = temFaixaDoDia && modo === 'dia';
  return { universo: naFaixaDoDia ? nightlyNumbers : activeNumbers, temFaixaDoDia, naFaixaDoDia };
}

/**
 * O que pode ser marcado nesta conferência.
 *
 * Em apuração e baixadas ficam na grade para o número não sumir do meio da
 * sequência, mas são desabilitadas e se resolvem no bloco de Divergências —
 * então não são nem presentes nem faltantes.
 *
 * Existe como função para a GRADE e o ATALHO "todas presentes" partirem da
 * mesma lista: enquanto cada um calculava a sua, o atalho registrava como
 * presentes comandas que a grade nem deixava tocar.
 */
export function conferiveisDaGrade(universo: number[], underReview: number[], lostNumbers: number[]): number[] {
  const fora = new Set([...underReview, ...lostNumbers]);
  return universo.filter((n) => !fora.has(n));
}
