/**
 * Faixas de comandas: a regra de não se sobrepor.
 *
 * A tela de Configurações sempre disse "as faixas não devem se sobrepor", mas
 * o servidor aceitava salvar. Regra que só existe como recado é regra que vai
 * ser violada — e foi: uma unidade ficou com "2–300" e "1–700" ao mesmo tempo,
 * o total virou contagem distinta para não inventar 999 comandas, e as faixas
 * de madrugada e semanal passaram a dizer coisas diferentes sobre as mesmas
 * comandas.
 */

export interface Faixa {
  id?: string;
  name: string;
  rangeStart: number;
  rangeEnd: number;
}

/** Dois intervalos fechados se cruzam quando cada um começa antes do fim do outro. */
export function seCruzam(a: { rangeStart: number; rangeEnd: number }, b: { rangeStart: number; rangeEnd: number }): boolean {
  return a.rangeStart <= b.rangeEnd && b.rangeStart <= a.rangeEnd;
}

/**
 * A primeira faixa que colide com `nova`, ou null.
 *
 * `exceptId` deixa a própria faixa de fora ao editar — senão toda edição
 * colidiria consigo mesma e nada mais poderia ser salvo.
 */
export function acharSobreposicao(nova: { rangeStart: number; rangeEnd: number }, outras: Faixa[], exceptId?: string): Faixa | null {
  return outras.find((f) => f.id !== exceptId && seCruzam(nova, f)) ?? null;
}

/** Mensagem para quem está cadastrando — diz QUAL faixa colide e onde. */
export function mensagemDeSobreposicao(nova: { rangeStart: number; rangeEnd: number }, colide: Faixa): string {
  const de = Math.max(nova.rangeStart, colide.rangeStart);
  const ate = Math.min(nova.rangeEnd, colide.rangeEnd);
  const trecho = de === ate ? `a comanda ${de}` : `as comandas ${de} a ${ate}`;
  return `A faixa ${nova.rangeStart}–${nova.rangeEnd} invade "${colide.name}" (${colide.rangeStart}–${colide.rangeEnd}): ${trecho} ficariam em duas faixas. Cada comanda pertence a uma faixa só.`;
}
