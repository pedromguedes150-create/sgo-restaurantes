import { describe, it, expect } from 'vitest';
import { horasEntre, horarioValido, calcularHoraExtra, textoHoras } from '@/lib/overtime/calculo';

/**
 * HORA EXTRA por período (v1.130.0): a conta é PURA e a mesma para a prévia
 * da tela e para a gravação no servidor. Regra própria — sem tipo de dia.
 */
describe('Hora Extra — horas entre início e fim', () => {
  it('18:00 → 22:00 = 4h', () => expect(horasEntre('18:00', '22:00')).toBe(4));
  it('passa da meia-noite: 22:00 → 02:00 = 4h (pedido)', () => expect(horasEntre('22:00', '02:00')).toBe(4));
  it('meia hora: 18:00 → 19:30 = 1,5h', () => expect(horasEntre('18:00', '19:30')).toBe(1.5));
  it('mesmo horário = 0 (período vazio)', () => expect(horasEntre('10:00', '10:00')).toBe(0));
  it('horário inválido = 0', () => {
    expect(horasEntre('', '10:00')).toBe(0);
    expect(horasEntre('10h', '12:00')).toBe(0);
  });
  it('horarioValido aceita HH:MM e recusa o resto', () => {
    expect(horarioValido('08:30')).toBe(true);
    expect(horarioValido('8:30')).toBe(true);
    expect(horarioValido('0830')).toBe(false);
    expect(horarioValido(null)).toBe(false);
    expect(horarioValido(undefined)).toBe(false);
  });
});

describe('Hora Extra — subtotal e total', () => {
  it('o exemplo do pedido: 4h × R$ 25,00 + R$ 10,00 de VT = R$ 110,00', () => {
    const c = calcularHoraExtra({ inicio: '22:00', fim: '02:00', valorHora: 25, vt: 10 });
    expect(c).toEqual({ horas: 4, valorHora: 25, subtotal: 100, vt: 10, total: 110 });
  });
  it('sem VT, total = subtotal', () => {
    const c = calcularHoraExtra({ inicio: '18:00', fim: '19:30', valorHora: 20 });
    expect(c.subtotal).toBe(30);
    expect(c.vt).toBe(0);
    expect(c.total).toBe(30);
  });
  it('VT negativo ou nulo não entra', () => {
    expect(calcularHoraExtra({ inicio: '18:00', fim: '20:00', valorHora: 15, vt: -5 }).total).toBe(30);
    expect(calcularHoraExtra({ inicio: '18:00', fim: '20:00', valorHora: 15, vt: null }).total).toBe(30);
  });
  it('arredonda a centavos', () => {
    const c = calcularHoraExtra({ inicio: '18:00', fim: '18:20', valorHora: 25 }); // 0,33h
    expect(c.horas).toBe(0.33);
    expect(c.subtotal).toBe(8.25);
  });
  it('textoHoras usa vírgula', () => {
    expect(textoHoras(4)).toBe('4h');
    expect(textoHoras(1.5)).toBe('1,5h');
  });
});
