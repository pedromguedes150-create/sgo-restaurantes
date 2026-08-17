import { describe, it, expect } from 'vitest';
import { parseHM, toHM, minutesOf, addMinutes, minuteOptions, snapToStep, outOfRange, nowHM } from '@/lib/ds/time';

describe('parseHM', () => {
  it('aceita HH:MM e H:MM', () => {
    expect(parseHM('09:30')).toEqual({ h: 9, m: 30 });
    expect(parseHM('9:30')).toEqual({ h: 9, m: 30 });
    expect(parseHM('00:00')).toEqual({ h: 0, m: 0 });
    expect(parseHM('23:59')).toEqual({ h: 23, m: 59 });
  });

  it('recusa hora ou minuto fora da faixa, e lixo', () => {
    expect(parseHM('24:00')).toBeNull();
    expect(parseHM('12:60')).toBeNull();
    expect(parseHM('12h30')).toBeNull();
    expect(parseHM('')).toBeNull();
    expect(parseHM(null)).toBeNull();
    expect(parseHM(undefined)).toBeNull();
  });
});

describe('addMinutes', () => {
  it('dá a volta no dia em vez de estourar (turno noturno)', () => {
    expect(addMinutes('23:50', 20)).toBe('00:10');
    expect(addMinutes('00:10', -20)).toBe('23:50');
  });

  it('soma dentro do dia', () => {
    expect(addMinutes('09:00', 90)).toBe('10:30');
    expect(addMinutes('09:00', 0)).toBe('09:00');
  });
});

describe('minuteOptions', () => {
  it('gera a lista conforme o passo', () => {
    expect(minuteOptions(30)).toEqual([0, 30]);
    expect(minuteOptions(15)).toEqual([0, 15, 30, 45]);
    expect(minuteOptions(5)).toHaveLength(12);
    expect(minuteOptions(1)).toHaveLength(60);
  });

  it('passo inválido não gera lista vazia', () => {
    expect(minuteOptions(0)).toHaveLength(60);
    expect(minuteOptions(-5)).toHaveLength(60);
    expect(minuteOptions(90)).toHaveLength(60);
    expect(minuteOptions(2.5)).toHaveLength(60);
  });
});

describe('snapToStep', () => {
  it('encaixa para baixo, para o valor legado continuar visível na coluna', () => {
    expect(snapToStep('09:07', 5)).toBe('09:05');
    expect(snapToStep('09:07', 30)).toBe('09:00');
    expect(snapToStep('09:30', 30)).toBe('09:30');
  });

  it('não muda a hora ao encaixar o minuto', () => {
    expect(snapToStep('23:59', 15)).toBe('23:45');
  });
});

describe('outOfRange', () => {
  it('marca o que está antes do mínimo ou depois do máximo', () => {
    expect(outOfRange('08:00', '09:00')).toBe(true);
    expect(outOfRange('09:00', '09:00')).toBe(false);
    expect(outOfRange('10:00', '09:00')).toBe(false);
    expect(outOfRange('19:00', undefined, '18:00')).toBe(true);
  });

  it('sem limites, nada fica de fora', () => {
    expect(outOfRange('03:00')).toBe(false);
  });
});

describe('minutesOf e nowHM', () => {
  it('converte para minutos desde 00:00', () => {
    expect(minutesOf('00:00')).toBe(0);
    expect(minutesOf('01:30')).toBe(90);
    expect(minutesOf('lixo')).toBeNull();
  });

  it('nowHM respeita o passo', () => {
    const d = new Date(2026, 7, 15, 9, 37);
    expect(nowHM(d)).toBe('09:37');
    expect(nowHM(d, 15)).toBe('09:30');
  });

  it('toHM preenche com zero à esquerda', () => {
    expect(toHM(9, 5)).toBe('09:05');
  });
});
