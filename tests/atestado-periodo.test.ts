import { describe, it, expect } from 'vitest';
import { conciliarPeriodo, somarDias, diasEntre } from '@/lib/certificates/periodo';

/**
 * "Retorno" não é o fim do afastamento. O caso da Quesia (01/10/2026):
 * 2 dias · início 29/09 · retorno 01/10 → o fim é 30/09, e são 2 dias.
 */
describe('conciliarPeriodo', () => {
  it('o caso real: 2 dias, início 29/09, "retorno" 01/10 lido como fim → fim 30/09, 2 dias, ajustado', () => {
    const r = conciliarPeriodo({ startDate: '2026-09-29', endDate: '2026-10-01', returnDate: '2026-10-01', days: 2 });
    expect(r).toEqual({ startDate: '2026-09-29', endDate: '2026-09-30', days: 2, fimAjustado: true, motivo: 'DIAS' });
  });

  it('sem o nº de dias, o retorno define o fim (retorno − 1)', () => {
    const r = conciliarPeriodo({ startDate: '2026-09-29', endDate: null, returnDate: '2026-10-01', days: null });
    expect(r).toEqual({ startDate: '2026-09-29', endDate: '2026-09-30', days: 2, fimAjustado: false, motivo: null });
    const r2 = conciliarPeriodo({ startDate: '2026-09-29', endDate: '2026-10-01', returnDate: '2026-10-01', days: null });
    expect(r2.endDate).toBe('2026-09-30');
    expect(r2.motivo).toBe('RETORNO');
  });

  it('fim coerente com os dias não é "ajuste"; 1 dia = início e fim iguais', () => {
    expect(conciliarPeriodo({ startDate: '2026-09-29', endDate: '2026-09-30', returnDate: null, days: 2 }).fimAjustado).toBe(false);
    expect(conciliarPeriodo({ startDate: '2026-09-29', endDate: null, returnDate: null, days: 1 }).endDate).toBe('2026-09-29');
  });

  it('sem dias nem retorno, vale a data de fim lida; vira o mês/ano certo', () => {
    expect(conciliarPeriodo({ startDate: '2026-09-29', endDate: '2026-10-03', returnDate: null, days: null })).toMatchObject({ endDate: '2026-10-03', days: 5, fimAjustado: false });
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(diasEntre('2026-09-29', '2026-09-28')).toBeNull();
  });

  it('dado inválido não derruba: datas fora do formato viram nulas', () => {
    expect(conciliarPeriodo({ startDate: '29/09/2026', endDate: 'x', returnDate: null, days: 2 })).toMatchObject({ startDate: null, endDate: null, days: 2 });
  });
});
