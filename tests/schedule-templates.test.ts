import { describe, it, expect } from 'vitest';
import { normalizarHora, rotuloDoCiclo, cicloSemanal, TIPOS_PADRAO, CICLO_MAXIMO } from '@/lib/schedule/templates';

/**
 * Tipos de escala — as regras puras.
 *
 * O ponto do cadastro: quase toda escala da CLT é "trabalha X, folga Y", e até
 * o 12x36 cabe nisso (1 × 1, em dias de calendário). Guardar o CICLO em vez de
 * uma lista fixa no código deixa a operação criar o que precisar.
 */

describe('normalizarHora', () => {
  it('aceita HH:MM e completa o zero', () => {
    expect(normalizarHora('14:00')).toBe('14:00');
    expect(normalizarHora('9:05')).toBe('09:05');
    expect(normalizarHora('2217')).toBe('22:17');
  });

  it('vazio vira nulo — horário é opcional', () => {
    expect(normalizarHora('')).toBeNull();
    expect(normalizarHora('   ')).toBeNull();
    expect(normalizarHora(null)).toBeNull();
  });

  it('hora impossível é recusada, não "corrigida"', () => {
    /* Corrigir 25:00 para 01:00 escreveria no cadastro um horário que ninguém
       digitou — pior do que recusar e pedir de novo. */
    expect(normalizarHora('25:00')).toBeNull();
    expect(normalizarHora('12:75')).toBeNull();
    expect(normalizarHora('manhã')).toBeNull();
  });
});

describe('rotuloDoCiclo', () => {
  it('6 e 1 viram "6x1"', () => {
    expect(rotuloDoCiclo(6, 1)).toBe('6x1');
    expect(rotuloDoCiclo(5, 2)).toBe('5x2');
  });

  it('o 12x36 é 1x1 em dias de calendário', () => {
    /* O nome que a operação lê é o do cadastro ("12x36 Noturno"); o ciclo é o
       que o gerador usa — e contar dias corridos é o que conserta a virada de
       mês, onde a paridade do dia dava dois trabalhos seguidos. */
    expect(rotuloDoCiclo(1, 1)).toBe('1x1');
  });
});

describe('cicloSemanal', () => {
  it('só fecha na semana quando soma 7', () => {
    /* É a condição para existir "dia fixo de folga": num ciclo de 8 dias a
       folga anda de dia da semana sozinha, e prometer "sempre domingo" seria
       mentira. */
    expect(cicloSemanal(6, 1)).toBe(true);
    expect(cicloSemanal(5, 2)).toBe(true);
    expect(cicloSemanal(1, 1)).toBe(false);
    expect(cicloSemanal(4, 2)).toBe(false);
  });
});

describe('Tipos padrão', () => {
  it('cobrem as escalas comuns da rede', () => {
    const nomes = TIPOS_PADRAO.map((t) => t.name);
    expect(nomes).toContain('6x1');
    expect(nomes).toContain('5x2');
    expect(nomes).toContain('12x36');
  });

  it('nenhum tipo padrão passa do ciclo máximo', () => {
    expect(TIPOS_PADRAO.every((t) => t.workDays + t.offDays <= CICLO_MAXIMO)).toBe(true);
  });

  it('nenhum tipo padrão nasce sem folga', () => {
    /* Ciclo sem folga marcaria o mês inteiro como trabalho. */
    expect(TIPOS_PADRAO.every((t) => t.offDays >= 1)).toBe(true);
  });

  it('os padrão vêm SEM horário', () => {
    /* O mesmo 6x1 é de manhã numa unidade e à tarde na outra; chutar um horário
       que ninguém confere é pior do que deixar vazio. */
    expect(TIPOS_PADRAO.every((t) => !('startTime' in t))).toBe(true);
  });
});
