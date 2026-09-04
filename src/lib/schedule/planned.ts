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
