import { soData, diaDeFolgaNaSemana, ehDomingoDoMes, type ModoDeFolga } from './vigencia';

/**
 * O Planejado de um dia, a partir da vigência que vale nele.
 *
 * Duas formas de decidir, e a escolha entre elas é o coração da parte 2:
 *
 * 1. **Ciclo que fecha na semana com dia fixo** (6x1, 5x2): a folga é ancorada
 *    no DIA DA SEMANA. É o que permite prometer "folga no domingo" e cumprir —
 *    e é a única forma que suporta o domingo entrando a cada N semanas, porque
 *    aí o dia de folga muda de semana para semana e nenhum ciclo fixo expressa
 *    isso.
 *
 * 2. **Qualquer outro ciclo** (12x36, 4x2): posição contada em DIAS CORRIDOS
 *    desde a âncora. É o que conserta o 12x36, que hoje é decidido pela
 *    paridade do dia do mês e dá dois dias seguidos de trabalho em toda virada
 *    de mês com 31 dias.
 */
export interface VersaoParaPlanejado {
  workDays: number;
  offDays: number;
  anchorDate: Date;
  startDate: Date;
  weeklyOffDay: number | null;
  offMode: ModoDeFolga;
  /** LEGADO: 'a cada N semanas'. Não decide mais nada — ver sundayOfMonth. */
  sundayEveryWeeks: number | null;
  /** Qual domingo do mês é a folga EXTRA (1º…5º), no modo FIXED_PLUS_SUNDAY. */
  sundayOfMonth?: number | null;
}

/** Dias corridos entre duas datas (só a data conta). */
function diasEntre(a: Date, b: Date): number {
  return Math.round((soData(a) - soData(b)) / 86_400_000);
}

/** A folga cai neste dia? */
export function folgaNoDia(v: VersaoParaPlanejado, data: Date): boolean {
  const ciclo = v.workDays + v.offDays;
  if (ciclo <= 0) return false;

  const semanal = ciclo === 7 && v.weeklyOffDay !== null && v.weeklyOffDay !== undefined;
  if (semanal) {
    /* O domingo do mês é uma folga A MAIS, não uma troca: a folga fixa segue
       valendo naquela semana. Antes ela era MOVIDA para o domingo, e a quinta
       sumia da grade — foi o relato do Alan. */
    if (v.offMode === 'FIXED_PLUS_SUNDAY' && ehDomingoDoMes(data, v.sundayOfMonth)) return true;

    const inicioDaFolga = diaDeFolgaNaSemana(
      v.offMode,
      v.weeklyOffDay as number,
      v.startDate,
      data,
    );
    /* Folgas consecutivas a partir do dia escolhido: no 5x2 com folga no
       sábado, folga sábado E domingo. */
    const dia = data.getUTCDay();
    for (let i = 0; i < v.offDays; i++) {
      if ((inicioDaFolga + i) % 7 === dia) return true;
    }
    return false;
  }

  /* DIAS CORRIDOS desde a âncora — nunca a paridade do dia do mês, que quebra
     na virada de todo mês de 31 dias. */
  const pos = ((diasEntre(data, v.anchorDate) % ciclo) + ciclo) % ciclo;
  return pos >= v.workDays;
}

/** 'WORK' | 'OFF' — o que a grade mostra como Planejado. */
export function planejadoDoDia(v: VersaoParaPlanejado, data: Date): 'WORK' | 'OFF' {
  return folgaNoDia(v, data) ? 'OFF' : 'WORK';
}

/**
 * Prévia do ciclo para a tela de cadastro: os próximos dias TRABALHADOS a
 * partir de uma data, dado o início do ciclo.
 *
 * Existe para responder, na própria folha, à pergunta que o 12x36 sempre
 * levanta: "ela trabalha nos dias ímpares; e quando o mês tem 31 dias?". A
 * conta é em dias corridos desde o início do ciclo, então a prévia MOSTRA a
 * troca de ímpar para par na virada — 29/10, 31/10, 02/11, 04/11 — em vez de
 * pedir que a pessoa acredite no texto.
 *
 * @param anchorISO início do ciclo (YYYY-MM-DD); inválido → lista vazia
 * @param aPartirDe primeiro dia da prévia (só a data conta)
 * @param quantos  quantos dias trabalhados devolver
 * @returns datas ISO (YYYY-MM-DD) dos próximos dias trabalhados
 */
export function proximosDiasTrabalhados(
  anchorISO: string,
  workDays: number,
  offDays: number,
  aPartirDe: Date,
  quantos = 6,
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorISO)) return [];
  const [y, m, dd] = anchorISO.split('-').map(Number);
  const anchorDate = new Date(Date.UTC(y, m - 1, dd));
  /* Date.UTC "arruma" mês 13 e dia 45 em vez de reclamar: a data só vale se
     continuar sendo a que foi digitada. */
  if (anchorDate.getUTCMonth() !== m - 1 || anchorDate.getUTCDate() !== dd) return [];
  const ciclo = workDays + offDays;
  if (ciclo <= 0 || workDays <= 0) return [];

  const v: VersaoParaPlanejado = {
    workDays, offDays, anchorDate, startDate: anchorDate,
    weeklyOffDay: null, offMode: 'CYCLE_ONLY', sundayEveryWeeks: null, sundayOfMonth: null,
  };
  const out: string[] = [];
  const inicio = soData(aPartirDe);
  /* Cada ciclo tem `workDays` dias trabalhados: `quantos` dias cabem em
     `ceil(quantos/workDays)` ciclos — o teto evita varrer o calendário à toa. */
  const limite = Math.ceil(quantos / workDays) * ciclo + ciclo;
  for (let i = 0; i < limite && out.length < quantos; i++) {
    const data = new Date(inicio + i * 86_400_000);
    if (!folgaNoDia(v, data)) out.push(data.toISOString().slice(0, 10));
  }
  return out;
}
