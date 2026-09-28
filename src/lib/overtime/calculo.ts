/**
 * HORA EXTRA — a conta, PURA (v1.130.0). Sem import de servidor: a tela do
 * gerente calcula a prévia daqui, e o servidor recalcula com a MESMA função.
 *
 * Regra própria, separada do freelancer: não há tipo de dia. O gerente informa
 * o período e ESCOLHE um valor/hora entre os autorizados da unidade.
 */

const HM = /^(\d{1,2}):(\d{2})$/;

/** Horas entre dois HH:MM. Fim menor que início = virou a meia-noite (22:00→02:00 = 4h). */
export function horasEntre(inicio: string, fim: string): number {
  const m = (s: string) => { const x = HM.exec(s.trim()); return x ? Number(x[1]) * 60 + Number(x[2]) : null; };
  const a = m(inicio), b = m(fim);
  if (a == null || b == null) return 0;
  const diff = b >= a ? b - a : b + 24 * 60 - a;
  return Math.round((diff / 60) * 100) / 100;
}

export const horarioValido = (s: string | null | undefined) => typeof s === 'string' && HM.test(s.trim());

export interface CalculoHoraExtra {
  horas: number;
  valorHora: number;
  /** horas × valor/hora */
  subtotal: number;
  vt: number;
  /** subtotal + vale-transporte */
  total: number;
}

const c2 = (n: number) => Math.round(n * 100) / 100;

export function calcularHoraExtra(i: { inicio: string; fim: string; valorHora: number; vt?: number | null }): CalculoHoraExtra {
  const horas = horasEntre(i.inicio, i.fim);
  const valorHora = c2(Math.max(0, Number(i.valorHora) || 0));
  const vt = i.vt && i.vt > 0 ? c2(Number(i.vt)) : 0;
  const subtotal = c2(horas * valorHora);
  return { horas, valorHora, subtotal, vt, total: c2(subtotal + vt) };
}

/** "4h", "1,5h". */
export const textoHoras = (h: number) => `${String(c2(h)).replace('.', ',')}h`;
