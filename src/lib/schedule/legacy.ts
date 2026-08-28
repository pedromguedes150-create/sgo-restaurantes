import { soData } from './vigencia';

/**
 * Tradução das escalas antigas para o formato novo (parte 3).
 *
 * As linhas anteriores à parte 2 descrevem o ciclo por `scheduleType` + máscara,
 * e o Planejado delas sai do gerador antigo. Este arquivo descobre o ciclo
 * equivalente e — quando o ciclo fecha na semana — o **dia da folga que elas já
 * produzem hoje**, para que a tradução não mude o que a grade mostra.
 *
 * O 12x36 é o caso em que a mudança é o objetivo: o gerador antigo decide pela
 * paridade do dia do mês e dá dois dias seguidos de trabalho em toda virada de
 * mês com 31 dias.
 */

export type TipoLegado = 'TWELVE36_ODD' | 'TWELVE36_EVEN' | 'SIX_ONE' | 'FIVE_TWO' | 'CUSTOM';

export interface CicloInferido {
  workDays: number;
  offDays: number;
  /** 0=domingo … 6=sábado. Nulo quando o ciclo não fecha na semana. */
  weeklyOffDay: number | null;
  /** O gerador antigo e o novo produzem o mesmo resultado para esta escala? */
  mesmoResultado: boolean;
}

/**
 * Máscara "TTTTTFF" → 5 e 2, **desde que os T venham todos antes dos F**.
 *
 * Uma máscara alternada ("TFTFTFF") não é "trabalha X, folga Y": traduzir com o
 * mesmo número de dias produziria uma escala diferente da que a pessoa cumpre.
 * Nesse caso a resposta é não traduzir.
 */
export function cicloDaMascara(mask: string): { workDays: number; offDays: number } | null {
  const m = (mask || '').toUpperCase().replace(/[^TF]/g, '');
  if (!m || !m.includes('T')) return null;
  const primeiroF = m.indexOf('F');
  if (primeiroF === -1) return null; // sem folga não é ciclo válido
  const contiguo = /^T+F+$/.test(m);
  if (!contiguo) return null;
  return { workDays: primeiroF, offDays: m.length - primeiroF };
}

/**
 * O ciclo equivalente de uma escala antiga.
 *
 * `anchorDate` é o que revela o dia da folga: no 6x1 antigo, a folga cai em
 * `âncora + 6`; no 5x2, em `âncora + 5` e no dia seguinte.
 */
export function inferirCicloDoLegado(
  scheduleType: TipoLegado,
  customMask: string | null,
  anchorDate: Date,
): CicloInferido | null {
  const diaDaAncora = new Date(soData(anchorDate)).getUTCDay();

  switch (scheduleType) {
    case 'SIX_ONE':
      return { workDays: 6, offDays: 1, weeklyOffDay: (diaDaAncora + 6) % 7, mesmoResultado: true };
    case 'FIVE_TWO':
      return { workDays: 5, offDays: 2, weeklyOffDay: (diaDaAncora + 5) % 7, mesmoResultado: true };
    case 'TWELVE36_ODD':
    case 'TWELVE36_EVEN':
      /* 12x36 em dias de calendário é 1 × 1. O resultado MUDA de propósito: é
         justamente a paridade do dia do mês que produz dois trabalhos seguidos
         na virada de todo mês de 31 dias. */
      return { workDays: 1, offDays: 1, weeklyOffDay: null, mesmoResultado: false };
    case 'CUSTOM': {
      const ciclo = cicloDaMascara(customMask ?? '');
      if (!ciclo) return null;
      const semanal = ciclo.workDays + ciclo.offDays === 7;
      return {
        ...ciclo,
        weeklyOffDay: semanal ? (diaDaAncora + ciclo.workDays) % 7 : null,
        mesmoResultado: true,
      };
    }
  }
}

/**
 * A âncora que faz o 12x36 novo **começar trabalhando no mesmo dia** em que o
 * antigo trabalharia.
 *
 * Sem isso, a escala inverteria na migração: quem trabalharia amanhã passaria a
 * folgar, e a troca de turno da unidade iria junto.
 */
export function ancoraDo12x36(scheduleType: 'TWELVE36_ODD' | 'TWELVE36_EVEN', aPartirDe: Date): Date {
  const base = new Date(soData(aPartirDe));
  const trabalhaNoDia = (d: Date) =>
    scheduleType === 'TWELVE36_ODD' ? d.getUTCDate() % 2 === 1 : d.getUTCDate() % 2 === 0;
  /* Se a data de corte é dia de trabalho pela regra antiga, ela mesma é a
     âncora (posição 0 = trabalha). Senão, a âncora é o dia seguinte. */
  if (trabalhaNoDia(base)) return base;
  const seguinte = new Date(base);
  seguinte.setUTCDate(seguinte.getUTCDate() + 1);
  return seguinte;
}
