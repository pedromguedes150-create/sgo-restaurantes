import { describe, it, expect } from 'vitest';
import { seCruzam, acharSobreposicao, mensagemDeSobreposicao } from '@/lib/commands/ranges';

const faixa = (name: string, rangeStart: number, rangeEnd: number, id = name) => ({ id, name, rangeStart, rangeEnd });

describe('seCruzam', () => {
  it('faixas encostadas NÃO se cruzam (1–300 e 301–700)', () => {
    /* O cadastro certo da Moreira: se isto acusasse colisão, o jeito correto
       de cadastrar seria impossível. */
    expect(seCruzam({ rangeStart: 1, rangeEnd: 300 }, { rangeStart: 301, rangeEnd: 700 })).toBe(false);
  });

  it('uma dentro da outra se cruza (2–300 dentro de 1–700)', () => {
    /* O cadastro que existia de verdade e ninguém percebeu. */
    expect(seCruzam({ rangeStart: 2, rangeEnd: 300 }, { rangeStart: 1, rangeEnd: 700 })).toBe(true);
  });

  it('cruzamento parcial nas pontas', () => {
    expect(seCruzam({ rangeStart: 1, rangeEnd: 301 }, { rangeStart: 301, rangeEnd: 700 })).toBe(true);
    expect(seCruzam({ rangeStart: 300, rangeEnd: 400 }, { rangeStart: 1, rangeEnd: 300 })).toBe(true);
  });

  it('uma comanda só também colide', () => {
    expect(seCruzam({ rangeStart: 5, rangeEnd: 5 }, { rangeStart: 1, rangeEnd: 300 })).toBe(true);
  });
});

describe('acharSobreposicao', () => {
  const existentes = [faixa('Salão', 1, 300), faixa('Reserva', 301, 700)];

  it('acha a faixa que colide', () => {
    expect(acharSobreposicao({ rangeStart: 1, rangeEnd: 700 }, existentes)?.name).toBe('Salão');
  });

  it('faixa livre passa', () => {
    expect(acharSobreposicao({ rangeStart: 701, rangeEnd: 900 }, existentes)).toBeNull();
  });

  it('editar a própria faixa não colide consigo mesma', () => {
    /* Sem o exceptId, nenhuma edição poderia ser salva — nem para corrigir. */
    expect(acharSobreposicao({ rangeStart: 1, rangeEnd: 250 }, existentes, 'Salão')).toBeNull();
  });

  it('mas ao editar, ainda colide com as OUTRAS', () => {
    expect(acharSobreposicao({ rangeStart: 1, rangeEnd: 400 }, existentes, 'Salão')?.name).toBe('Reserva');
  });

  it('sem faixa nenhuma, qualquer uma passa', () => {
    expect(acharSobreposicao({ rangeStart: 1, rangeEnd: 300 }, [])).toBeNull();
  });
});

describe('mensagemDeSobreposicao', () => {
  it('diz qual faixa e QUAIS comandas ficariam duplicadas', () => {
    const m = mensagemDeSobreposicao({ rangeStart: 1, rangeEnd: 700 }, faixa('Sequência 1', 2, 300));
    expect(m).toContain('Sequência 1');
    expect(m).toContain('2 a 300');
  });

  it('uma comanda só: fala no singular', () => {
    const m = mensagemDeSobreposicao({ rangeStart: 300, rangeEnd: 400 }, faixa('Salão', 1, 300));
    expect(m).toContain('a comanda 300');
    expect(m).not.toContain('300 a 300');
  });
});
