/**
 * Vigência da escala do colaborador e a conta do dia fixo de folga.
 *
 * Separado do acesso ao banco porque são as duas regras que, se estiverem
 * erradas, produzem uma grade de presença plausível e falsa — o pior tipo de
 * erro, porque ninguém desconfia.
 */

export interface VersaoDeEscala {
  /** Primeiro dia em que esta versão vale. */
  startDate: Date;
  /** Último dia em que valeu. Nulo = é a vigente. */
  endDate: Date | null;
}

/** Meia-noite UTC do dia — comparação de datas sem hora atrapalhando. */
export function soData(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Qual versão valia num dia.
 *
 * Devolve `null` antes da primeira vigência: o colaborador não tinha escala
 * cadastrada naquele dia, e inventar uma faria a grade afirmar folgas e
 * trabalhos que ninguém combinou.
 */
export function vigenciaNaData<T extends VersaoDeEscala>(versoes: T[], data: Date): T | null {
  const dia = soData(data);
  const candidatas = versoes.filter((v) => {
    if (soData(v.startDate) > dia) return false;
    return v.endDate === null || soData(v.endDate) >= dia;
  });
  if (candidatas.length === 0) return null;
  /* Se duas versões se sobrepuserem (dado antigo, importação), vale a que
     começou por último — é a decisão mais recente sobre aquele dia. */
  return candidatas.reduce((a, b) => (soData(b.startDate) >= soData(a.startDate) ? b : a));
}

/**
 * Data-âncora que faz a folga cair no dia da semana escolhido.
 *
 * O gerador conta a posição no ciclo a partir da âncora: posições
 * `0..workDays-1` trabalham e o resto folga. Então o primeiro dia de folga é
 * `âncora + workDays`, e queremos que ELE caia no dia pedido.
 *
 * Só faz sentido com ciclo de 7 dias. Num ciclo de 8, a folga anda de dia da
 * semana a cada volta e não há âncora que a fixe — por isso o cadastro nem
 * oferece a opção.
 *
 * @param weeklyOffDay 0=domingo … 6=sábado
 * @returns a âncora — a última data <= `aPartirDe` que satisfaz a conta
 */
export function ancoraParaFolgaFixa(weeklyOffDay: number, workDays: number, aPartirDe: Date): Date {
  const alvo = ((Math.trunc(weeklyOffDay) % 7) + 7) % 7;
  /* Dia da semana que a âncora precisa ter para que âncora+workDays caia no
     alvo. O +7 evita o resto negativo do JavaScript. */
  const diaDaAncora = ((alvo - (workDays % 7)) % 7 + 7) % 7;

  const base = new Date(soData(aPartirDe));
  const recuo = ((base.getUTCDay() - diaDaAncora) % 7 + 7) % 7;
  base.setUTCDate(base.getUTCDate() - recuo);
  return base;
}

/** 0=domingo … 6=sábado, como o cadastro guarda. */
export const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/**
 * O dia anterior — usado para fechar a vigência antiga quando entra uma nova.
 *
 * Fechar em `novaStart - 1` e não em `novaStart` evita o dia em que as duas
 * valeriam ao mesmo tempo.
 */
export function diaAnterior(d: Date): Date {
  const x = new Date(soData(d));
  x.setUTCDate(x.getUTCDate() - 1);
  return x;
}

/** Como a folga se comporta ao longo das semanas (espelha o enum do banco). */
export type ModoDeFolga = 'FIXED_WEEKLY' | 'FIXED_PLUS_SUNDAY' | 'CYCLE_ONLY';

export const MODO_LABEL: Record<ModoDeFolga, string> = {
  FIXED_WEEKLY: 'Folga fixa semanal',
  FIXED_PLUS_SUNDAY: 'Folga fixa + domingo em ciclo',
  CYCLE_ONLY: 'Folga somente em ciclo',
};

export const MODO_EXPLICACAO: Record<ModoDeFolga, string> = {
  FIXED_WEEKLY: 'O colaborador tem um dia fixo de folga toda semana, sem variação.',
  FIXED_PLUS_SUNDAY: 'Dia fixo de folga, mas de tempos em tempos a folga cai no domingo — é o que faz o descanso coincidir com o domingo periodicamente.',
  CYCLE_ONLY: 'Sem dia fixo: a folga anda conforme o ciclo, a partir da data de início.',
};

/**
 * Semanas entre um domingo e outro no modo FIXED_PLUS_SUNDAY.
 *
 * 4 = um domingo por mês, na primeira semana. Era 7, herdado de quando a conta
 * corria pelo ano inteiro; num mês não existe "semana 7", então 7 continua
 * valendo (dá o mesmo resultado: só a semana 1), mas 4 é o número que descreve
 * a intenção sem precisar de explicação.
 */
export const DOMINGO_A_CADA_PADRAO = 4;

/** Quantas semanas um mês pode ter — o teto do campo "a cada quantas semanas". */
export const SEMANAS_NO_MES = 5;

/**
 * Em que semana DO MÊS a data cai: 0 = a 1ª semana, 1 = a 2ª, e assim por diante.
 *
 * A régua é o **domingo que abre a semana**, não o dia em si. Contar pelo dia
 * do mês (1–7, 8–14…) parece igual e não é: uma semana do calendário atravessa
 * a fronteira dos blocos, e aí o domingo dela podia cair num bloco e a terça em
 * outro. Quando isso acontecia, a semana ficava **sem folga nenhuma** — o
 * domingo não era de folga porque o bloco dele não era o do ciclo, e a terça
 * também não porque o bloco dela mandava folgar no domingo. Uma semana inteira
 * trabalhada, que é ilegal e que ninguém notaria olhando a grade.
 *
 * Com o domingo como régua, todos os dias da mesma semana recebem a mesma
 * decisão — e a promessa "uma folga por semana" se mantém.
 */
export function semanaDoMes(data: Date): number {
  const domingo = new Date(soData(data));
  domingo.setUTCDate(domingo.getUTCDate() - domingo.getUTCDay());
  return Math.floor((domingo.getUTCDate() - 1) / 7);
}

/**
 * As semanas do mês em que a folga cai no domingo, em número de gente (1ª, 2ª…).
 * A tela usa isto para mostrar o efeito do número escolhido, em vez de pedir
 * que a pessoa imagine.
 */
export function semanasComDomingo(aCada: number): number[] {
  const n = Math.max(1, Math.trunc(aCada || DOMINGO_A_CADA_PADRAO));
  const out: number[] = [];
  for (let s = 0; s < SEMANAS_NO_MES; s += n) out.push(s + 1);
  return out;
}

/**
 * O dia da semana em que a folga cai numa data — já considerando o modo.
 *
 * `FIXED_PLUS_SUNDAY` é o único que muda de semana para semana: a cada N
 * semanas DO MÊS a folga daquela semana vai para o domingo; nas outras, fica no
 * dia fixo. Sem isso, "folga fixa na terça" significaria nunca folgar num
 * domingo.
 */
export function diaDeFolgaNaSemana(
  modo: ModoDeFolga,
  weeklyOffDay: number,
  inicioDaVigencia: Date,
  data: Date,
  sundayEveryWeeks = DOMINGO_A_CADA_PADRAO,
): number {
  const fixo = ((Math.trunc(weeklyOffDay) % 7) + 7) % 7;
  if (modo !== 'FIXED_PLUS_SUNDAY') return fixo;

  const n = Math.max(1, Math.trunc(sundayEveryWeeks || DOMINGO_A_CADA_PADRAO));
  /* A conta é DENTRO DO MÊS e recomeça no dia 1º. Antes ela corria desde o
     início da vigência, sem parar: o domingo ia andando pelo calendário e cada
     mês saía diferente do anterior — não dava para dizer à equipe em que
     domingo ela folga. Agora "a cada 2 semanas" é sempre 1ª e 3ª do mês.
     (`inicioDaVigencia` continua na assinatura porque a vigência ainda decide
     QUAL configuração vale no dia; ela só não conta mais as semanas.) */
  void inicioDaVigencia;
  const semana = semanaDoMes(data);
  /* Semana 1 do mês já é uma "semana de domingo": esperar N semanas atrasaria a
     promessa logo no mês em que ela foi cadastrada. */
  return semana % n === 0 ? 0 : fixo;
}

/**
 * A folga da pessoa em uma frase — para a lista de Pessoas dizer o que está
 * cadastrado sem obrigar a abrir cada colaborador.
 */
export function resumoDaFolga(modo: ModoDeFolga, weeklyOffDay: number | null, sundayEveryWeeks: number | null): string {
  if (modo === 'CYCLE_ONLY') return 'folga pelo ciclo';
  const dia = weeklyOffDay != null ? DIAS_DA_SEMANA[weeklyOffDay] : null;
  if (!dia) return MODO_LABEL[modo].toLowerCase();
  if (modo === 'FIXED_PLUS_SUNDAY') {
    const semanas = semanasComDomingo(sundayEveryWeeks ?? DOMINGO_A_CADA_PADRAO);
    return `folga ${dia.toLowerCase()} + domingo na ${semanas.map((s) => `${s}ª`).join(' e ')} semana do mês`;
  }
  return `folga ${dia.toLowerCase()}`;
}
