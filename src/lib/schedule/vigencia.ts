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
  FIXED_PLUS_SUNDAY: 'Folga fixa + 1 domingo no mês',
  CYCLE_ONLY: 'Folga somente em ciclo',
};

export const MODO_EXPLICACAO: Record<ModoDeFolga, string> = {
  FIXED_WEEKLY: 'O colaborador tem um dia fixo de folga toda semana, sem variação.',
  FIXED_PLUS_SUNDAY: 'O colaborador folga no dia fixo TODA semana e ainda ganha UM domingo no mês, o que você escolher (1º, 2º, 3º…). São folgas que se somam: na semana do domingo ele folga nos dois dias.',
  CYCLE_ONLY: 'Sem dia fixo: a folga anda conforme o ciclo, a partir da data de início.',
};

/**
 * Qual domingo do mês é a folga extra, quando ninguém escolheu: o primeiro.
 */
export const DOMINGO_DO_MES_PADRAO = 1;

/** Um mês tem no máximo cinco domingos. */
export const DOMINGOS_NO_MES = 5;

/** "3º domingo" — para a tela e o resumo falarem como a equipe fala. */
export function ordinalDoDomingo(n: number): string {
  return `${Math.max(1, Math.trunc(n))}º domingo do mês`;
}

/**
 * Esta data é o **enésimo domingo do mês**?
 *
 * A regra da rede, dita pelo Alan: *"a folga é toda quinta e o colaborador tem
 * direito a 1 domingo no mês — 1º, 2º, 3º, 4º ou 5º"*. É uma folga que **se
 * soma** à fixa: na semana desse domingo a pessoa folga nos dois dias.
 *
 * O modelo anterior MOVIA a folga da quinta para o domingo naquela semana — e
 * era por isso que a quinta sumia da grade, que foi o relato.
 *
 * Mês sem 5º domingo simplesmente não tem a folga extra; forçar para o 4º seria
 * inventar um dia que ninguém combinou.
 */
export function ehDomingoDoMes(data: Date, ordinal: number | null | undefined): boolean {
  if (ordinal == null) return false;
  const n = Math.trunc(ordinal);
  if (!Number.isFinite(n) || n < 1 || n > DOMINGOS_NO_MES) return false;
  if (data.getUTCDay() !== 0) return false;
  return Math.floor((data.getUTCDate() - 1) / 7) + 1 === n;
}

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
 * O dia da semana em que a folga FIXA cai — igual em todas as semanas.
 *
 * Antes esta função também decidia o domingo, movendo a folga da semana para
 * ele. Agora o domingo é uma folga **a mais** (ver `ehDomingoDoMes`), então o
 * dia fixo não muda nunca: é o que faz "folga toda quinta" ser verdade em todas
 * as semanas do mês, inclusive na do domingo.
 */
export function diaDeFolgaNaSemana(
  modo: ModoDeFolga,
  weeklyOffDay: number,
  inicioDaVigencia: Date,
  data: Date,
): number {
  void modo; void inicioDaVigencia; void data;
  return ((Math.trunc(weeklyOffDay) % 7) + 7) % 7;
}

/**
 * A folga da pessoa em uma frase — para a lista de Pessoas dizer o que está
 * cadastrado sem obrigar a abrir cada colaborador.
 */
export function resumoDaFolga(modo: ModoDeFolga, weeklyOffDay: number | null, sundayOfMonth: number | null): string {
  if (modo === 'CYCLE_ONLY') return 'folga pelo ciclo';
  const dia = weeklyOffDay != null ? DIAS_DA_SEMANA[weeklyOffDay] : null;
  if (!dia) return MODO_LABEL[modo].toLowerCase();
  if (modo === 'FIXED_PLUS_SUNDAY') {
    return `folga toda ${dia.toLowerCase()} + ${ordinalDoDomingo(sundayOfMonth ?? DOMINGO_DO_MES_PADRAO)}`;
  }
  return `folga ${dia.toLowerCase()}`;
}
