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
  return `A faixa ${nova.rangeStart}–${nova.rangeEnd} invade "${colide.name}" (${colide.rangeStart}–${colide.rangeEnd}): ${trecho} ficariam em duas faixas. Cada comanda pertence a uma faixa só. Para a semana conferir uma parte e o fim de semana outra (ex.: 1–300 e 1–400), cadastre aqui UMA sequência que cubra tudo e programe cada dia em "Programação das conferências", logo abaixo.`;
}

/**
 * Saídas de um clique quando a nova faixa [de, ate] invade UMA faixa existente
 * (v1.205.0). Em vez de só recusar, a tela oferece: ampliar a existente até cobrir
 * a nova, ou cadastrar só o trecho que falta. Só quando a invasão é com uma única
 * faixa e a nova a ESTENDE (não cabe inteira dentro dela — aí não há o que fazer).
 */
export interface SaidaDeSobreposicao {
  /** Ampliar a faixa existente para cobrir a união das duas. */
  ampliar: { id: string; name: string; rangeStart: number; rangeEnd: number } | null;
  /** Cadastrar apenas o trecho novo, fora da existente (um dos lados, o que sobrar). */
  soOQueFalta: { rangeStart: number; rangeEnd: number }[];
}

export function saidasDeSobreposicao(nova: { rangeStart: number; rangeEnd: number }, outras: Faixa[]): SaidaDeSobreposicao | null {
  const colidem = outras.filter((f) => seCruzam(nova, f));
  if (colidem.length !== 1) return null;
  const c = colidem[0];
  const trechos: { rangeStart: number; rangeEnd: number }[] = [];
  if (nova.rangeStart < c.rangeStart) trechos.push({ rangeStart: nova.rangeStart, rangeEnd: c.rangeStart - 1 });
  if (nova.rangeEnd > c.rangeEnd) trechos.push({ rangeStart: c.rangeEnd + 1, rangeEnd: nova.rangeEnd });
  if (trechos.length === 0) return null; // a nova cabe dentro da existente: nada a acrescentar
  return {
    ampliar: c.id ? { id: c.id, name: c.name, rangeStart: Math.min(nova.rangeStart, c.rangeStart), rangeEnd: Math.max(nova.rangeEnd, c.rangeEnd) } : null,
    soOQueFalta: trechos,
  };
}
