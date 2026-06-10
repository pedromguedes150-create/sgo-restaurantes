import { fromZonedTime } from 'date-fns-tz';
import { format, addDays } from 'date-fns';
import type { UnitTimeConfig } from '@/lib/date/operational';

/**
 * Calcula o instante-limite (UTC) de uma tarefa dentro de um dia operacional.
 *
 * O dia operacional 'YYYY-MM-DD' vai da hora de corte (ex: 04:00) até a hora de
 * corte do dia seguinte. Logo:
 *  - limitTime >= corte  → cai na data-calendário do próprio dia operacional
 *  - limitTime <  corte  → é de madrugada, cai no dia-calendário SEGUINTE
 */
export function computeDueAt(
  operationalDate: string,
  limitTime: string, // "HH:mm"
  { timezone, cutoffHour }: UnitTimeConfig,
): Date {
  const [hh, mm] = limitTime.split(':').map(Number);
  const limitHour = hh ?? 0;

  const calendarDate =
    limitHour < cutoffHour
      ? format(addDays(new Date(`${operationalDate}T00:00:00`), 1), 'yyyy-MM-dd')
      : operationalDate;

  const local = `${calendarDate}T${String(limitHour).padStart(2, '0')}:${String(mm ?? 0).padStart(2, '0')}:00`;
  return fromZonedTime(local, timezone);
}
