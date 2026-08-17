import { describe, it, expect } from 'vitest';
import { toISO, parseISO, daysInMonth, firstWeekday, addDays, addMonths, formatBr, todayISO } from '@/lib/ds/date';

describe('DatePicker — lógica de datas', () => {
  it('parseISO valida formato e existência do dia', () => {
    expect(parseISO('2026-08-11')).toEqual({ y: 2026, m: 8, d: 11 });
    expect(parseISO('2026-02-30')).toBeNull(); // fevereiro não tem 30
    expect(parseISO('2026-13-01')).toBeNull();
    expect(parseISO('11/08/2026')).toBeNull();
    expect(parseISO(null)).toBeNull();
  });

  it('daysInMonth cobre bissexto', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29); // bissexto
    expect(daysInMonth(2026, 8)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it('firstWeekday: 1º/ago/2026 é sábado (6)', () => {
    expect(firstWeekday(2026, 8)).toBe(6);
  });

  it('addDays atravessa mês e ano sem deslocar por fuso', () => {
    expect(addDays('2026-08-11', 1)).toBe('2026-08-12');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // bissexto
  });

  it('addMonths não vaza para o mês seguinte (grampeia o dia)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-08-11', 5)).toBe('2027-01-11'); // vira o ano
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15');
  });

  it('formatBr e toISO', () => {
    expect(formatBr('2026-08-11')).toBe('11/08/2026');
    expect(formatBr(null)).toBe('');
    expect(formatBr('bagunça')).toBe('');
    expect(toISO(2026, 8, 1)).toBe('2026-08-01');
  });

  it('todayISO usa a data LOCAL (não desloca perto da meia-noite)', () => {
    // 23:30 local de 11/08 continua sendo 11/08, mesmo que em UTC já seja dia 12.
    expect(todayISO(new Date(2026, 7, 11, 23, 30))).toBe('2026-08-11');
    expect(todayISO(new Date(2026, 7, 11, 0, 15))).toBe('2026-08-11');
  });
});
