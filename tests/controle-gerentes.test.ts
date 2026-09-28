import { describe, it, expect } from 'vitest';
import {
  ausenciasNoPeriodo, ausenciasPorDia, diaDaSemana, diasDoMes, intervaloDoPeriodo, montarGrade, resumoDaUnidade,
  semFolgaHa7Dias, semGerenteNoDia, semanaDe, textoDoIntervalo, type GerenteCru,
} from '@/lib/controle-gerentes';

/**
 * CONTROLE DE GERENTES — o núcleo puro.
 *
 * Setembro/2026: dia 1 é terça; segunda 28/09 abre a semana que termina no
 * domingo 04/10. É o exemplo do pedido (Seg 28 … Qui 01).
 */

const g = (p: Partial<GerenteCru> & { userId: string; name: string }): GerenteCru => ({
  weekdays: [], startTime: null, endTime: null, ausencias: [], ...p,
});
const folga = (d: string, ate = d) => ({ kind: 'FOLGA' as const, startDate: d, endDate: ate, note: null });
const ferias = (d: string, ate: string) => ({ kind: 'FERIAS' as const, startDate: d, endDate: ate, note: null });

const SEG_A_SAB = [1, 2, 3, 4, 5, 6];

describe('datas', () => {
  it('a semana vai de SEGUNDA a DOMINGO', () => {
    expect(semanaDe('2026-09-28')).toEqual({ de: '2026-09-28', ate: '2026-10-04' }); // segunda
    expect(semanaDe('2026-10-01')).toEqual({ de: '2026-09-28', ate: '2026-10-04' }); // quinta
    expect(semanaDe('2026-10-04')).toEqual({ de: '2026-09-28', ate: '2026-10-04' }); // domingo ainda é desta semana
    expect(diaDaSemana('2026-09-01')).toBe(2); // terça
  });

  it('hoje, esta semana, próxima e mês', () => {
    const hoje = '2026-09-30';
    expect(intervaloDoPeriodo('hoje', hoje, 2026, 9)).toEqual({ de: hoje, ate: hoje });
    expect(intervaloDoPeriodo('semana', hoje, 2026, 9)).toEqual({ de: '2026-09-28', ate: '2026-10-04' });
    expect(intervaloDoPeriodo('proxima', hoje, 2026, 9)).toEqual({ de: '2026-10-05', ate: '2026-10-11' });
    expect(intervaloDoPeriodo('mes', hoje, 2026, 10)).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
  });

  it('texto do intervalo: um dia pelo nome, vários pelo recorte', () => {
    expect(textoDoIntervalo('2026-09-28', '2026-09-28')).toBe('Segunda 28/09');
    expect(textoDoIntervalo('2026-09-28', '2026-10-02')).toBe('28/09 a 02/10');
  });
});

describe('a grade do mês: F, FE ou nada', () => {
  const grazi = g({ userId: 'gr', name: 'Grazieli', weekdays: SEG_A_SAB, ausencias: [folga('2026-09-02'), folga('2026-09-08')] });
  const kris = g({ userId: 'kr', name: 'Krislley', weekdays: SEG_A_SAB, ausencias: [folga('2026-09-03'), ferias('2026-09-20', '2026-09-24')] });

  it('uma linha por gerente, uma coluna por dia, em ordem alfabética', () => {
    const grade = montarGrade([kris, grazi], 2026, 9);
    expect(grade.dias).toHaveLength(30);
    expect(grade.linhas.map((l) => l.name)).toEqual(['Grazieli', 'Krislley']);
    const gz = grade.linhas[0];
    expect(gz.dias[1]).toBe('FOLGA');   // dia 02
    expect(gz.dias[2]).toBeNull();      // dia 03
    expect(gz.folgas).toBe(2);
    const kr = grade.linhas[1];
    expect(kr.dias.slice(19, 24)).toEqual(['FERIAS', 'FERIAS', 'FERIAS', 'FERIAS', 'FERIAS']);
    expect(kr.ferias).toBe(5);
  });

  it('dia sem gerente: todos os que têm horário estão fora; sem horário nenhum não acusa', () => {
    const a = g({ userId: 'a', name: 'A', weekdays: [1, 2], ausencias: [folga('2026-09-01')] }); // terça 01 de folga
    expect(semGerenteNoDia([a], '2026-09-01')).toBe(true);
    expect(semGerenteNoDia([a], '2026-09-07')).toBe(false); // segunda, trabalha
    expect(semGerenteNoDia([g({ userId: 'b', name: 'B' })], '2026-09-01')).toBe(false); // sem horário: não acusa
  });
});

describe('resumo da unidade', () => {
  it('gerentes ativos, folgas no mês, folgas nesta semana e quem tira férias', () => {
    const hoje = '2026-09-30'; // semana 28/09–04/10
    const gs = [
      g({ userId: 'a', name: 'A', ausencias: [folga('2026-09-02'), folga('2026-09-28'), folga('2026-10-01')] }),
      g({ userId: 'b', name: 'B', ausencias: [ferias('2026-09-10', '2026-09-12')] }),
      g({ userId: 'c', name: 'C' }),
    ];
    expect(resumoDaUnidade(gs, 2026, 9, hoje)).toEqual({
      gerentesAtivos: 3,
      folgasNoMes: 2,        // 02 e 28 (01/10 é outubro)
      folgasNaSemana: 2,     // 28/09 e 01/10: a semana atravessa o mês
      gerentesDeFerias: 1,
    });
  });

  it('sem folga há 7 dias: só quem tem horário e nenhuma folga na janela', () => {
    const hoje = '2026-09-30';
    const gs = [
      g({ userId: 'a', name: 'Ana', weekdays: SEG_A_SAB, ausencias: [folga('2026-09-25')] }),
      g({ userId: 'b', name: 'Bruno', weekdays: SEG_A_SAB, ausencias: [folga('2026-09-15')] }),
      g({ userId: 'c', name: 'Caio' }), // sem horário: fora da regra
    ];
    expect(semFolgaHa7Dias(gs, hoje)).toEqual(['Bruno']);
  });
});

describe('quem está de folga, dia a dia', () => {
  it('esta semana: todos os dias aparecem, inclusive os sem folga', () => {
    const gs = [
      g({ userId: 'gr', name: 'Grazieli', ausencias: [folga('2026-09-28')] }),
      g({ userId: 'kr', name: 'Krislley', ausencias: [folga('2026-09-30')] }),
      g({ userId: 'ge', name: 'Geovana', ausencias: [folga('2026-10-01')] }),
    ];
    const dias = ausenciasPorDia(gs, '2026-09-28', '2026-10-04');
    expect(dias).toHaveLength(7);
    expect(dias.map((d) => d.ausentes.map((a) => a.name).join(','))).toEqual(['Grazieli', '', 'Krislley', 'Geovana', '', '', '']);
  });
});

describe('a rede consolida sem misturar', () => {
  it('as ausências de uma unidade saem recortadas ao período, em ordem de data', () => {
    const gs = [
      g({ userId: 'ar', name: 'Arthur', ausencias: [folga('2026-09-29')] }),
      g({ userId: 'ga', name: 'Gabriela', ausencias: [ferias('2026-09-20', '2026-10-10')] }),
    ];
    const itens = ausenciasNoPeriodo(gs, '2026-09-28', '2026-10-04');
    expect(itens.map((i) => `${i.name}:${i.de}>${i.ate}:${i.kind}`)).toEqual([
      'Gabriela:2026-09-28>2026-10-04:FERIAS', // 20 dias de férias aparecem só na semana
      'Arthur:2026-09-29>2026-09-29:FOLGA',
    ]);
  });

  it('cada unidade é calculada só com os SEUS gerentes', () => {
    const unidadeA = [g({ userId: 'x', name: 'Xavier', ausencias: [folga('2026-09-29')] })];
    const unidadeB = [g({ userId: 'y', name: 'Yara', ausencias: [folga('2026-09-29')] })];
    expect(ausenciasNoPeriodo(unidadeA, '2026-09-28', '2026-10-04').map((i) => i.name)).toEqual(['Xavier']);
    expect(ausenciasNoPeriodo(unidadeB, '2026-09-28', '2026-10-04').map((i) => i.name)).toEqual(['Yara']);
    expect(diasDoMes(2026, 2)).toHaveLength(28);
  });
});
