import { describe, it, expect } from 'vitest';
import { resumirRotina, datasDoIntervalo, limitesDoMes } from '@/lib/commands/painel-calculo';
import { diaPrevisto, type Programacao, type Excecao } from '@/lib/commands/programacao';

/** v1.202.0 — rotina (previstas/realizadas/atrasadas/pendentes) separada do resultado operacional. */

const d = (data: string, prevista: boolean, realizada: boolean) => ({ data, prevista, realizada });

describe('resumirRotina', () => {
  it('conta previstas, realizadas, atrasadas e pendentes de hoje', () => {
    const r = resumirRotina([
      d('2026-11-01', true, true),
      d('2026-11-02', true, false), // passou sem conferir
      d('2026-11-03', true, true),
      d('2026-11-04', true, false), // hoje, ainda dá tempo
      d('2026-11-05', true, false), // futuro: ignorado
    ], '2026-11-04');
    expect(r).toMatchObject({ previstas: 4, realizadas: 2, atrasadas: 1, pendentes: 1, extras: 0 });
    expect(r.cumprimentoPct).toBe(67); // 2 ÷ (2 + 1): hoje só entra quando fechar
  });

  it('dia não previsto não cobra; conferir nele é extra e não rende a mais', () => {
    const r = resumirRotina([d('2026-11-01', false, false), d('2026-11-02', false, true), d('2026-11-03', true, true)], '2026-11-10');
    expect(r).toMatchObject({ previstas: 1, realizadas: 1, atrasadas: 0, extras: 1, cumprimentoPct: 100 });
  });

  it('nenhum dia fechado = nada a medir (nulo), não zero', () => {
    expect(resumirRotina([d('2026-11-04', true, false)], '2026-11-04').cumprimentoPct).toBeNull();
    expect(resumirRotina([], '2026-11-04').cumprimentoPct).toBeNull();
  });
});

describe('intervalo de datas', () => {
  it('lista o intervalo inclusive e os limites do mês', () => {
    expect(datasDoIntervalo('2026-11-28', '2026-12-01')).toEqual(['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01']);
    expect(limitesDoMes('2026-02')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
  });
});

describe('diaPrevisto', () => {
  const semana: Programacao = { id: 'a', nome: 'Semana', tipo: 'FAIXA_DO_DIA', dias: [1, 2, 3, 4, 5], inicioHora: null, fimHora: null, faixaDe: 1, faixaAte: 300, prioridade: 0, ativa: true };
  const ex = (o: Partial<Excecao>): Excecao => ({ id: 'e', data: '2026-11-09', nome: 'Feriado', semConferencia: false, tipo: null, faixaDe: null, faixaAte: null, ...o });
  it('sem programação todo dia é previsto (rotina de sempre)', () => {
    expect(diaPrevisto([], null, '2026-11-15')).toBe(true);
  });
  it('com programação vale o dia da semana dela', () => {
    expect(diaPrevisto([semana], null, '2026-11-09')).toBe(true); // segunda
    expect(diaPrevisto([semana], null, '2026-11-15')).toBe(false); // domingo
  });
  it('exceção sem conferência tira o dia; exceção com tipo o torna previsto', () => {
    expect(diaPrevisto([semana], ex({ semConferencia: true }), '2026-11-09')).toBe(false);
    expect(diaPrevisto([semana], ex({ tipo: 'COMPLETA', data: '2026-11-15' }), '2026-11-15')).toBe(true);
  });
  it('programação pausada não conta', () => {
    expect(diaPrevisto([{ ...semana, ativa: false }], null, '2026-11-15')).toBe(true);
  });
});
