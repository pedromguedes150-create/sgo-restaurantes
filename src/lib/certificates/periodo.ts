/**
 * PERÍODO DO ATESTADO — conciliação PURA entre o que o documento diz.
 *
 * O caso real (01/10/2026, Quesia): "2 dia(s) · Início 29/09/2026 · Retorno
 * 01/10/2026". RETORNO é o dia em que a pessoa VOLTA ao trabalho, não o último
 * dia afastado — a IA tratou o retorno como fim e o SGO contou 3 dias
 * (29, 30 e 01). O documento é redundante de propósito, e é isso que permite
 * conferir: início + nº de dias − 1 = fim; retorno = fim + 1.
 *
 * Ordem de confiança: o NÚMERO DE DIAS escrito vence (é o que o médico
 * atestou); sem ele, o retorno define o fim (retorno − 1); só sem os dois a
 * data de fim lida vale como está.
 */
export interface PeriodoLido {
  startDate: string | null;
  endDate: string | null;
  /** Dia em que volta ao trabalho, se o documento trouxer. */
  returnDate: string | null;
  days: number | null;
}

export interface PeriodoConciliado {
  startDate: string | null;
  endDate: string | null;
  days: number | null;
  /** O fim lido foi substituído pelo derivado (dias ou retorno). */
  fimAjustado: boolean;
  motivo: 'DIAS' | 'RETORNO' | null;
}

const RE = /^\d{4}-\d{2}-\d{2}$/;

export function somarDias(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(start: string, end: string): number | null {
  if (!RE.test(start) || !RE.test(end)) return null;
  const a = Date.parse(start + 'T00:00:00Z'); const b = Date.parse(end + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.floor((b - a) / 86_400_000) + 1;
}

export function conciliarPeriodo(p: PeriodoLido): PeriodoConciliado {
  const start = p.startDate && RE.test(p.startDate) ? p.startDate : null;
  const endLido = p.endDate && RE.test(p.endDate) ? p.endDate : null;
  const retorno = p.returnDate && RE.test(p.returnDate) ? p.returnDate : null;
  const dias = typeof p.days === 'number' && Number.isInteger(p.days) && p.days >= 1 ? p.days : null;

  if (start && dias) {
    const fim = somarDias(start, dias - 1);
    return { startDate: start, endDate: fim, days: dias, fimAjustado: endLido !== null && endLido !== fim, motivo: endLido !== null && endLido !== fim ? 'DIAS' : null };
  }
  if (start && retorno && retorno > start) {
    const fim = somarDias(retorno, -1);
    return { startDate: start, endDate: fim, days: diasEntre(start, fim), fimAjustado: endLido !== null && endLido !== fim, motivo: endLido !== null && endLido !== fim ? 'RETORNO' : null };
  }
  if (start && endLido) return { startDate: start, endDate: endLido, days: diasEntre(start, endLido), fimAjustado: false, motivo: null };
  return { startDate: start, endDate: endLido, days: dias, fimAjustado: false, motivo: null };
}
