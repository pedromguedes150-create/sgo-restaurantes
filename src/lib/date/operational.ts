import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { subDays, format, addDays } from 'date-fns';

/**
 * DATA OPERACIONAL (regra inegociável nº 4).
 *
 * Restaurantes fecham depois da meia-noite. Cada unidade tem uma "hora de corte"
 * (padrão 04:00). Um lançamento feito ANTES do corte pertence ao dia operacional
 * ANTERIOR. Toda lógica diária (tarefas, metas, relatórios) usa esta data, não a
 * data-calendário.
 *
 * Banco grava em UTC; o cálculo é feito no fuso da unidade.
 */

export interface UnitTimeConfig {
  timezone: string; // ex: 'America/Sao_Paulo'
  cutoffHour: number; // 0-23, padrão 4
}

/**
 * Retorna a data operacional ('YYYY-MM-DD') de um instante para uma unidade.
 */
export function operationalDate(
  instant: Date,
  { timezone, cutoffHour }: UnitTimeConfig,
): string {
  const zoned = toZonedTime(instant, timezone); // wall clock local da unidade
  const base = zoned.getHours() < cutoffHour ? subDays(zoned, 1) : zoned;
  return format(base, 'yyyy-MM-dd');
}

/** Data operacional de agora. */
export function currentOperationalDate(cfg: UnitTimeConfig, now: Date = new Date()): string {
  return operationalDate(now, cfg);
}

/**
 * Intervalo UTC [início, fim) que corresponde a um dia operacional.
 * Útil para consultas: WHERE createdAt >= start AND createdAt < end.
 *
 * O dia operacional 'YYYY-MM-DD' começa às `cutoffHour` daquele dia (no fuso da
 * unidade) e termina às `cutoffHour` do dia seguinte.
 */
export function operationalDayRangeUtc(
  operationalDateStr: string,
  { timezone, cutoffHour }: UnitTimeConfig,
): { start: Date; end: Date } {
  const hh = String(cutoffHour).padStart(2, '0');
  const startLocal = `${operationalDateStr}T${hh}:00:00`;
  const start = fromZonedTime(startLocal, timezone);

  const nextDay = format(addDays(new Date(`${operationalDateStr}T00:00:00`), 1), 'yyyy-MM-dd');
  const endLocal = `${nextDay}T${hh}:00:00`;
  const end = fromZonedTime(endLocal, timezone);

  return { start, end };
}
