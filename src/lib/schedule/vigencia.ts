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

/** Semanas entre um domingo e outro no modo FIXED_PLUS_SUNDAY. */
export const DOMINGO_A_CADA_PADRAO = 7;

/** Quantas semanas inteiras separam duas datas (a partir da âncora). */
function semanasDesde(inicio: Date, data: Date): number {
  return Math.floor((soData(data) - soData(inicio)) / (7 * 86_400_000));
}

/**
 * O dia da semana em que a folga cai numa data — já considerando o modo.
 *
 * `FIXED_PLUS_SUNDAY` é o único que muda de semana para semana: a cada N
 * semanas contadas desde o início da vigência, a folga daquela semana vai para
 * o domingo; nas outras, fica no dia fixo. Sem isso, "folga fixa na terça"
 * significaria nunca folgar num domingo.
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
  const semana = semanasDesde(inicioDaVigencia, data);
  /* Semana 0 já é uma "semana de domingo": a promessa começa a valer no
     primeiro ciclo, não só depois de N semanas de espera. */
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
  if (modo === 'FIXED_PLUS_SUNDAY') return `folga ${dia.toLowerCase()} + domingo a cada ${sundayEveryWeeks ?? DOMINGO_A_CADA_PADRAO} semanas`;
  return `folga ${dia.toLowerCase()}`;
}
