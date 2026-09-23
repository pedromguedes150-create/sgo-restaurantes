import { addMonths, daysInMonth, todayISO, toISO } from '@/lib/ds/date';

/**
 * Períodos prontos do filtro de variação do gás — módulo PURO.
 *
 * O cartão do Dashboard e a página do relatório falam a mesma língua: o
 * cartão monta `?start=&end=` a partir de um destes presets e a página só lê
 * datas. Nada de "últimos 3 meses" calculado em dois lugares.
 */

export const PRESETS_DE_PERIODO = [
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'mesPassado', rotulo: 'Mês passado' },
  { valor: '3m', rotulo: 'Últimos 3 meses' },
  { valor: '6m', rotulo: 'Últimos 6 meses' },
  { valor: '12m', rotulo: 'Últimos 12 meses' },
  { valor: 'ano', rotulo: 'Este ano' },
  { valor: 'custom', rotulo: 'Escolher datas' },
] as const;

export type PresetDePeriodo = (typeof PRESETS_DE_PERIODO)[number]['valor'];

export function ehPreset(v: unknown): v is PresetDePeriodo {
  return typeof v === 'string' && PRESETS_DE_PERIODO.some((p) => p.valor === v);
}

/** Datas (inclusive) de um preset. `custom` devolve null: quem escolhe é a pessoa. */
export function datasDoPreset(preset: PresetDePeriodo, hoje: string = todayISO()): { start: string; end: string } | null {
  const [y, m] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))];
  switch (preset) {
    case 'mes':
      return { start: toISO(y, m, 1), end: toISO(y, m, daysInMonth(y, m)) };
    case 'mesPassado': {
      const primeiro = addMonths(toISO(y, m, 1), -1);
      const [py, pm] = [Number(primeiro.slice(0, 4)), Number(primeiro.slice(5, 7))];
      return { start: primeiro, end: toISO(py, pm, daysInMonth(py, pm)) };
    }
    /* "Últimos N meses" começa no dia 1 do mês de N−1 meses atrás e vai até
       hoje: é como as pessoas leem "últimos 3 meses" (julho, agosto e setembro),
       e não uma janela de 90 dias que corta um mês no meio. */
    case '3m': return { start: addMonths(toISO(y, m, 1), -2), end: hoje };
    case '6m': return { start: addMonths(toISO(y, m, 1), -5), end: hoje };
    case '12m': return { start: addMonths(toISO(y, m, 1), -11), end: hoje };
    case 'ano': return { start: toISO(y, 1, 1), end: hoje };
    default: return null;
  }
}
