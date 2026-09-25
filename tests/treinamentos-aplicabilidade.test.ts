import { describe, it, expect } from 'vitest';
import { normalizarFuncao, origemDoTreinamento, treinamentosAplicaveis, geraTreinamento, type PopParaAplicar, type ColaboradorParaAplicar } from '@/lib/treinamentos/aplicabilidade';

/**
 * A REGRA CENTRAL — "quem deve o quê" — sem banco.
 *
 * aplicáveis = gerais da unidade + da função + vínculo individual (+ setor,
 * regra anterior). Um POP por dois caminhos vira UM item; a função vence o
 * vínculo individual na origem registrada.
 */

const pop = (p: Partial<PopParaAplicar> & { id: string }): PopParaAplicar => ({ isInitial: false, jobTitles: [], sectorNames: [], collaboratorIds: [], ...p });
const colab = (c: Partial<ColaboradorParaAplicar> & { id: string }): ColaboradorParaAplicar => ({ jobTitle: null, sectorNames: [], ...c });

describe('normalizarFuncao', () => {
  it('iguala caixa, acentos e espaços — o RH grafa o mesmo cargo de vários jeitos', () => {
    expect(normalizarFuncao('Auxiliar de Cozinha')).toBe('auxiliar de cozinha');
    expect(normalizarFuncao('AUXILIAR DE COZINHA')).toBe('auxiliar de cozinha');
    expect(normalizarFuncao('  Auxiliar   de  cozinha ')).toBe('auxiliar de cozinha');
    expect(normalizarFuncao('Açougueiro')).toBe(normalizarFuncao('ACOUGUEIRO'));
    expect(normalizarFuncao(null)).toBe('');
  });
});

describe('origemDoTreinamento', () => {
  const paoDeQueijo = pop({ id: 'pq', jobTitles: ['Atendente', 'Auxiliar de Cozinha'], collaboratorIds: ['joao'] });
  const abertura = pop({ id: 'ab', isInitial: true });

  it('GERAL vale para todos, independentemente da função', () => {
    expect(origemDoTreinamento(colab({ id: 'x', jobTitle: 'Churrasqueiro' }), abertura)).toEqual({ origem: 'GENERAL', sectorName: null });
    expect(origemDoTreinamento(colab({ id: 'y', jobTitle: null }), abertura)).toEqual({ origem: 'GENERAL', sectorName: null });
  });

  it('DIRECIONADO por função: só quem tem a função (com grafia diferente)', () => {
    expect(origemDoTreinamento(colab({ id: 'm', jobTitle: 'AUXILIAR DE COZINHA' }), paoDeQueijo)?.origem).toBe('JOB_TITLE');
    expect(origemDoTreinamento(colab({ id: 'c', jobTitle: 'Churrasqueiro' }), paoDeQueijo)).toBeNull();
  });

  it('o churrasqueiro que assa pão de queijo entra por VÍNCULO INDIVIDUAL, sem mudar a função dele', () => {
    const joao = colab({ id: 'joao', jobTitle: 'Churrasqueiro' });
    expect(origemDoTreinamento(joao, paoDeQueijo)).toEqual({ origem: 'INDIVIDUAL', sectorName: null });
  });

  it('função E vínculo individual ao mesmo tempo = uma origem só, e é a FUNÇÃO (a principal)', () => {
    const carlos = colab({ id: 'joao', jobTitle: 'Auxiliar de Cozinha' });
    expect(origemDoTreinamento(carlos, paoDeQueijo)?.origem).toBe('JOB_TITLE');
  });

  it('setor do Mapa (regra anterior) continua valendo, com o setor que casou', () => {
    const p = pop({ id: 's', sectorNames: ['Cozinha', 'Salão'] });
    expect(origemDoTreinamento(colab({ id: 'a', sectorNames: ['Salão'] }), p)).toEqual({ origem: 'SECTOR', sectorName: 'Salão' });
    expect(origemDoTreinamento(colab({ id: 'b', sectorNames: ['Caixa'] }), p)).toBeNull();
  });

  it('POP de referência (sem público) não se aplica a ninguém', () => {
    const ref = pop({ id: 'r' });
    expect(geraTreinamento(ref)).toBe(false);
    expect(origemDoTreinamento(colab({ id: 'a', jobTitle: 'Atendente' }), ref)).toBeNull();
  });
});

describe('treinamentosAplicaveis — a conta do João', () => {
  it('30 POPs no sistema, 8 aplicáveis: o resultado tem 8, sem duplicidade', () => {
    const joao = colab({ id: 'joao', jobTitle: 'Auxiliar de Cozinha', sectorNames: ['Cozinha'] });
    const pops: PopParaAplicar[] = [
      ...Array.from({ length: 3 }, (_, i) => pop({ id: `geral${i}`, isInitial: true })),
      ...Array.from({ length: 3 }, (_, i) => pop({ id: `func${i}`, jobTitles: ['auxiliar de cozinha'] })),
      pop({ id: 'setor', sectorNames: ['Cozinha'] }),
      pop({ id: 'vinculo', jobTitles: ['Atendente'], collaboratorIds: ['joao'] }),
      // duplicidade: João por função E por vínculo — conta uma vez
      pop({ id: 'func0', jobTitles: ['Auxiliar de Cozinha'], collaboratorIds: ['joao'] }),
      ...Array.from({ length: 21 }, (_, i) => pop({ id: `outros${i}`, jobTitles: ['Churrasqueiro'] })),
    ];
    const r = treinamentosAplicaveis(joao, pops);
    expect(r.size).toBe(8);
    expect(r.get('vinculo')?.origem).toBe('INDIVIDUAL');
    expect(r.get('func0')?.origem).toBe('JOB_TITLE');
    expect(r.has('outros0')).toBe(false);
  });
});
