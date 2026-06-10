import { describe, it, expect } from 'vitest';
import { computeDueAt } from '@/lib/tasks/due';

const sp = { timezone: 'America/Sao_Paulo', cutoffHour: 4 }; // UTC-3

describe('computeDueAt — limite dentro do dia operacional', () => {
  it('limite diurno cai no próprio dia-calendário', () => {
    // 10:00 local = 13:00 UTC
    expect(computeDueAt('2026-06-10', '10:00', sp).toISOString()).toBe('2026-06-10T13:00:00.000Z');
  });

  it('limite noturno (antes da meia-noite) cai no próprio dia', () => {
    // 23:00 local = 02:00 UTC do dia seguinte
    expect(computeDueAt('2026-06-10', '23:00', sp).toISOString()).toBe('2026-06-11T02:00:00.000Z');
  });

  it('limite de madrugada (< corte) pertence ao dia-calendário seguinte', () => {
    // 02:00 local do dia 11 = 05:00 UTC
    expect(computeDueAt('2026-06-10', '02:00', sp).toISOString()).toBe('2026-06-11T05:00:00.000Z');
  });
});
