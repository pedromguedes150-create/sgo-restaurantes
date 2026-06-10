import { describe, it, expect } from 'vitest';
import {
  operationalDate,
  operationalDayRangeUtc,
  type UnitTimeConfig,
} from '@/lib/date/operational';

// America/Sao_Paulo (UTC-3, sem horário de verão atualmente)
const sp: UnitTimeConfig = { timezone: 'America/Sao_Paulo', cutoffHour: 4 };

describe('data operacional (regra nº 4)', () => {
  it('antes do corte (02:00 local) pertence ao dia anterior', () => {
    // 05:00 UTC = 02:00 em São Paulo
    const instant = new Date('2026-06-10T05:00:00Z');
    expect(operationalDate(instant, sp)).toBe('2026-06-09');
  });

  it('depois do corte (05:00 local) pertence ao próprio dia', () => {
    // 08:00 UTC = 05:00 em São Paulo
    const instant = new Date('2026-06-10T08:00:00Z');
    expect(operationalDate(instant, sp)).toBe('2026-06-10');
  });

  it('exatamente na hora de corte (04:00) pertence ao próprio dia', () => {
    // 07:00 UTC = 04:00 em São Paulo
    const instant = new Date('2026-06-10T07:00:00Z');
    expect(operationalDate(instant, sp)).toBe('2026-06-10');
  });

  it('respeita corte diferente por unidade (05:00)', () => {
    const shopping: UnitTimeConfig = { timezone: 'America/Sao_Paulo', cutoffHour: 5 };
    // 04:30 local → ainda dia anterior quando o corte é 05:00
    const instant = new Date('2026-06-10T07:30:00Z'); // 04:30 local
    expect(operationalDate(instant, shopping)).toBe('2026-06-09');
  });

  it('intervalo UTC do dia operacional começa e termina na hora de corte', () => {
    const { start, end } = operationalDayRangeUtc('2026-06-10', sp);
    expect(start.toISOString()).toBe('2026-06-10T07:00:00.000Z'); // 04:00 local
    expect(end.toISOString()).toBe('2026-06-11T07:00:00.000Z'); // 04:00 local do dia seguinte
  });
});
